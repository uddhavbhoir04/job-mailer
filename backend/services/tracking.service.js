/** Application tracking: send history, suppression (unsubscribe) list, dashboard stats. */
import { getDb } from '../config/db.js';
import { recruiterStats, markUnsubscribedByEmail } from '../models/recruiter.model.js';
import { getSetting } from '../models/settings.model.js';
import { normalizeEmail } from './emailValidation.service.js';

export function logAttempt({ recruiter, campaignId = null, subject = null, status, error = null, messageId = null, dryRun = false, attempt = 1 }) {
  getDb()
    .prepare(`INSERT INTO email_logs (recruiter_id, campaign_id, email, company, title, subject, status, error, message_id, dry_run, attempt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(recruiter.id, campaignId, recruiter.email, recruiter.company, recruiter.title, subject, status, error ? String(error).slice(0, 1000) : null, messageId, dryRun ? 1 : 0, attempt);
}

export function getHistory({ limit = 200, status = '', recruiterId } = {}) {
  const where = [];
  const params = [];
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (recruiterId) {
    where.push('recruiter_id = ?');
    params.push(recruiterId);
  }
  params.push(Math.min(Number(limit) || 200, 1000));
  return getDb()
    .prepare(`SELECT * FROM email_logs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`)
    .all(...params);
}

/** Real (non-dry-run) emails sent since local midnight – for Gmail daily limit. */
export const sentTodayCount = () =>
  getDb()
    .prepare(`SELECT COUNT(*) AS n FROM email_logs WHERE status = 'sent' AND dry_run = 0 AND created_at >= datetime('now', 'localtime', 'start of day', 'utc')`)
    .get().n;

// ---------------- Suppression list (unsubscribe / do-not-contact) ----------------

export function addSuppression(email, reason = 'unsubscribe') {
  const e = normalizeEmail(email);
  getDb().prepare('INSERT OR IGNORE INTO suppression_list (email, reason) VALUES (?, ?)').run(e, reason);
  markUnsubscribedByEmail(e);
}

export const removeSuppression = (email) => getDb().prepare('DELETE FROM suppression_list WHERE email = ?').run(normalizeEmail(email));

export const isSuppressed = (email) => Boolean(getDb().prepare('SELECT 1 FROM suppression_list WHERE email = ?').get(normalizeEmail(email)));

export const listSuppressions = () => getDb().prepare('SELECT * FROM suppression_list ORDER BY id DESC').all();

export function getStats() {
  const r = recruiterStats();
  const n = (v) => Number(v) || 0;
  return {
    total: n(r.total),
    validEmails: n(r.validEmails),
    invalidEmails: n(r.invalidEmails),
    sent: n(r.sent),
    pending: n(r.pending),
    failed: n(r.failed),
    unsubscribed: n(r.unsubscribed),
    dryRunTested: n(r.dryRunTested),
    duplicates: n(getSetting('duplicatesTotal', 0)),
    sentToday: sentTodayCount(),
  };
}
