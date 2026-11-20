/**
 * Sequential send queue (one email at a time).
 *
 * - Configurable delay (+ jitter) between emails, longer pause between batches
 * - Pause / resume / stop (pause takes effect immediately, even mid-delay)
 * - Retries temporary SMTP failures with exponential backoff
 * - Pauses on Gmail quota errors, stops on auth errors
 * - Enforces DAILY_SEND_LIMIT
 * - Survives restarts: a paused/orphaned campaign can be resumed from the DB
 *
 * Never-resend guarantee lives in recruiter.model.claimForSending().
 */
import { getDb } from '../config/db.js';
import { smtpConfigured } from '../config/index.js';
import { AppError } from '../utils/errors.js';
import { sleep, jitter } from '../utils/sleep.js';
import logger from '../utils/logger.js';
import * as Recruiters from '../models/recruiter.model.js';
import * as Campaigns from '../models/campaign.model.js';
import { getDefaultTemplate } from '../models/template.model.js';
import { getSendSettings } from '../models/settings.model.js';
import { renderEmail } from './emailGeneration.service.js';
import { sendMail, classifyError } from './gmail.service.js';
import { getResumeAttachment } from './resume.service.js';
import { logAttempt, isSuppressed, addSuppression, sentTodayCount } from './tracking.service.js';

const SENDABLE = new Set(['pending', 'failed', 'queued']);

/**
 * Sends the application email to a single recruiter, with retries.
 * Returns { status: 'sent'|'failed'|'skipped'|'quota'|'auth'|'aborted', error?, messageId? }
 */
export async function sendToRecruiter(id, { campaignId = null, dryRun, settings, template, force = false, stopSignal } = {}) {
  const recruiter = Recruiters.getRecruiter(id);
  if (!recruiter) return { status: 'skipped', error: 'Record not found' };

  const skip = (reason) => {
    logAttempt({ recruiter, campaignId, status: 'skipped', error: reason, dryRun });
    return { status: 'skipped', error: reason };
  };

  if (isSuppressed(recruiter.email)) {
    addSuppression(recruiter.email); // ensure status reflects it
    return skip('Recipient unsubscribed');
  }
  if (!Recruiters.claimForSending(id, { force })) {
    if (recruiter.status === 'sent') return skip('Already sent - not resending');
    if (!recruiter.is_valid_email) return skip(`Invalid email: ${recruiter.validation_error || recruiter.email}`);
    return skip(`Not sendable (status: ${recruiter.status})`);
  }

  let attachment;
  try {
    attachment = getResumeAttachment();
  } catch (err) {
    Recruiters.releaseRecruiter(id, err.message);
    return { status: 'auth', error: err.message }; // stops the campaign: nothing can be sent without resume
  }

  const email = renderEmail(template, recruiter, settings);
  const maxAttempts = settings.maxRetries + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const info = await sendMail({
        to: recruiter.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachment,
        senderName: settings.senderName,
        dryRun,
      });
      if (dryRun) Recruiters.markDryRun(id);
      else Recruiters.markSent(id, info.messageId);
      logAttempt({ recruiter, campaignId, subject: email.subject, status: 'sent', messageId: info.messageId, dryRun, attempt });
      return { status: 'sent', messageId: info.messageId, dryRun };
    } catch (err) {
      const c = classifyError(err);
      logger.warn(`Send to ${recruiter.email} failed (attempt ${attempt}/${maxAttempts}, ${c.type}): ${c.message}`);

      if (c.type === 'quota' || c.type === 'auth') {
        Recruiters.releaseRecruiter(id, c.message); // not the recipient's fault: keep it pending
        logAttempt({ recruiter, campaignId, subject: email.subject, status: 'deferred', error: c.message, dryRun, attempt });
        return { status: c.type, error: c.message };
      }
      if (c.type === 'temporary' && attempt < maxAttempts) {
        logAttempt({ recruiter, campaignId, subject: email.subject, status: 'retry', error: c.message, dryRun, attempt });
        await sleep(Math.min(5000 * 2 ** (attempt - 1), 60000), stopSignal); // 5s, 10s, 20s...
        if (stopSignal?.aborted) {
          Recruiters.releaseRecruiter(id, 'Stopped during retry');
          return { status: 'aborted' };
        }
        continue;
      }
      Recruiters.markFailed(id, c.message);
      logAttempt({ recruiter, campaignId, subject: email.subject, status: 'failed', error: c.message, dryRun, attempt });
      return { status: 'failed', error: c.message };
    }
  }
  return { status: 'failed', error: 'Unexpected' }; // unreachable
}

class SendQueue {
  /** In-memory state of the active campaign (null when idle). */
  state = null;

  isActive() {
    return Boolean(this.state && ['running', 'paused'].includes(this.state.status));
  }

  snapshot() {
    const s = this.state;
    const campaign = s ? Campaigns.getCampaign(s.campaignId) : Campaigns.getLatestCampaign();
    if (!campaign) return { active: false, campaign: null };
    const processed = campaign.sent + campaign.failed + campaign.skipped;
    return {
      active: this.isActive(),
      // A DB 'paused' campaign without memory state can still be resumed (after restart).
      resumable: campaign.status === 'paused',
      campaign: { ...campaign, recruiter_ids: undefined, processed },
      current: s?.current ?? null,
      nextSendAt: s?.status === 'running' ? s.nextSendAt : null,
    };
  }

  async start({ recruiterIds }) {
    if (this.isActive()) throw new AppError('A sending campaign is already active. Pause/stop it first.', 409);
    if (!Array.isArray(recruiterIds) || !recruiterIds.length) throw new AppError('Select at least one recruiter', 400);

    const settings = getSendSettings();
    if (!settings.dryRun && !smtpConfigured()) throw new AppError('Gmail is not configured (backend/.env)', 400);
    getResumeAttachment(); // throws if missing
    getDefaultTemplate();

    const ids = [...new Set(recruiterIds.map(Number))];
    const rows = Recruiters.getRecruitersByIds(ids);
    const eligible = rows.filter((r) => r.is_valid_email && SENDABLE.has(r.status) && !isSuppressed(r.email)).map((r) => r.id);
    const ineligible = ids.length - eligible.length;
    if (!eligible.length) throw new AppError('Nothing to send: the selected records are already sent, invalid or unsubscribed.', 400);

    if (!settings.dryRun) {
      const left = settings.dailyLimit - sentTodayCount();
      if (left <= 0) throw new AppError(`Daily send limit (${settings.dailyLimit}) reached. Try again tomorrow.`, 429);
    }

    const campaign = Campaigns.createCampaign({ recruiterIds: eligible, dryRun: settings.dryRun, delayMs: settings.delayMs, batchSize: settings.batchSize });
    Recruiters.markQueued(eligible);
    this.#initState(campaign, eligible, settings.dryRun);
    logger.info(`Campaign #${campaign.id} started: ${eligible.length} emails (dryRun=${settings.dryRun})`);
    this.#run();
    return { ...this.snapshot(), ineligible };
  }

  pause(note = 'Paused by user') {
    const s = this.state;
    if (!s || s.status !== 'running') throw new AppError('No running campaign to pause', 409);
    s.status = 'paused';
    s.pauseCtl.abort();
    Campaigns.updateCampaign(s.campaignId, { status: 'paused', note });
    logger.info(`Campaign #${s.campaignId} paused: ${note}`);
    return this.snapshot();
  }

  resume(campaignId) {
    const s = this.state;
    if (s && s.status === 'paused') {
      s.status = 'running';
      s.pauseCtl = new AbortController();
      Campaigns.updateCampaign(s.campaignId, { status: 'running', note: null });
      s.resumeWaiter?.();
      return this.snapshot();
    }
    if (this.isActive()) throw new AppError('Campaign is already running', 409);

    // Rebuild from DB (e.g. after a server restart).
    const campaign = campaignId ? Campaigns.getCampaign(campaignId) : Campaigns.getLatestCampaign();
    if (!campaign || campaign.status !== 'paused') throw new AppError('No paused campaign to resume', 404);
    const done = new Set(
      getDb()
        .prepare(`SELECT DISTINCT recruiter_id FROM email_logs WHERE campaign_id = ? AND status IN ('sent','failed','skipped')`)
        .all(campaign.id)
        .map((r) => r.recruiter_id),
    );
    const remaining = campaign.recruiter_ids.filter((id) => !done.has(id));
    Recruiters.markQueued(remaining);
    Campaigns.updateCampaign(campaign.id, { status: 'running', note: null });
    this.#initState(campaign, remaining, campaign.dry_run, { sent: campaign.sent, failed: campaign.failed, skipped: campaign.skipped });
    this.#run();
    return this.snapshot();
  }

  stop() {
    const s = this.state;
    if (s && this.isActive()) {
      s.status = 'stopped';
      s.pauseCtl.abort();
      s.stopCtl.abort();
      s.resumeWaiter?.();
      return this.snapshot();
    }
    // A paused campaign from a previous server run.
    const latest = Campaigns.getLatestCampaign();
    if (latest?.status === 'paused') {
      Campaigns.updateCampaign(latest.id, { status: 'stopped', finished_at: new Date().toISOString() });
      Recruiters.releaseAllQueued();
      return this.snapshot();
    }
    throw new AppError('No active campaign', 409);
  }

  #initState(campaign, ids, dryRun, counts = { sent: 0, failed: 0, skipped: 0 }) {
    this.state = {
      campaignId: campaign.id,
      ids,
      index: 0,
      status: 'running',
      dryRun: Boolean(dryRun),
      ...counts,
      attemptedInBatch: 0,
      current: null,
      nextSendAt: null,
      pauseCtl: new AbortController(),
      stopCtl: new AbortController(),
      resumeWaiter: null,
    };
  }

  #persist() {
    const s = this.state;
    Campaigns.updateCampaign(s.campaignId, { sent: s.sent, failed: s.failed, skipped: s.skipped });
  }

  async #run() {
    const s = this.state;
    try {
      while (s.index < s.ids.length && s.status !== 'stopped') {
        if (s.status === 'paused') {
          await new Promise((resolve) => (s.resumeWaiter = resolve));
          s.resumeWaiter = null;
          continue;
        }

        // Settings are re-read every iteration so delay/limit edits apply live (dry-run is fixed per campaign).
        const settings = { ...getSendSettings(), dryRun: s.dryRun };
        if (!s.dryRun && sentTodayCount() >= settings.dailyLimit) {
          this.pause(`Daily send limit (${settings.dailyLimit}) reached. Resume tomorrow.`);
          continue;
        }

        const id = s.ids[s.index];
        const r = Recruiters.getRecruiter(id);
        s.current = r ? { id, email: r.email, company: r.company, name: r.name } : { id };
        const result = await sendToRecruiter(id, {
          campaignId: s.campaignId,
          dryRun: s.dryRun,
          settings,
          template: getDefaultTemplate(),
          stopSignal: s.stopCtl.signal,
        });
        s.current = null;

        if (result.status === 'quota') {
          this.pause(result.error);
          continue; // same recruiter is retried after resume
        }
        if (result.status === 'auth') {
          Campaigns.updateCampaign(s.campaignId, { note: result.error });
          s.status = 'stopped';
          break;
        }
        if (result.status === 'aborted') continue;

        s[result.status === 'sent' ? 'sent' : result.status === 'failed' ? 'failed' : 'skipped']++;
        s.index++;
        this.#persist();

        // Pace only after real attempts; skipped rows cost nothing.
        if (result.status !== 'skipped' && s.index < s.ids.length && s.status === 'running') {
          s.attemptedInBatch++;
          let wait = jitter(settings.delayMs);
          if (s.attemptedInBatch >= settings.batchSize) {
            s.attemptedInBatch = 0;
            wait = Math.max(wait, settings.batchPauseMs);
            logger.info(`Batch of ${settings.batchSize} done, pausing ${Math.round(wait / 1000)}s`);
          }
          s.nextSendAt = Date.now() + wait;
          await sleep(wait, s.pauseCtl.signal);
          s.nextSendAt = null;
        }
      }
    } catch (err) {
      logger.error(`Campaign #${s.campaignId} crashed: ${err.stack}`);
      Campaigns.updateCampaign(s.campaignId, { note: `Error: ${err.message}` });
      s.status = 'stopped';
    }

    const finalStatus = s.status === 'stopped' ? 'stopped' : 'completed';
    s.status = finalStatus;
    s.current = null;
    Recruiters.releaseQueuedIds(s.ids);
    this.#persist();
    Campaigns.updateCampaign(s.campaignId, { status: finalStatus, finished_at: new Date().toISOString() });
    logger.info(`Campaign #${s.campaignId} ${finalStatus}: sent=${s.sent} failed=${s.failed} skipped=${s.skipped}`);
  }
}

export const sendQueue = new SendQueue();
