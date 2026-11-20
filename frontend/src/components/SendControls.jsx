/** Start / pause / resume / stop sending, with progress bar and live status. */
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ConfirmDialog } from './ui.jsx';
import EmailPreview from './EmailPreview.jsx';

function Countdown({ until }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.round((until - now) / 1000));
  return <span>next email in {s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`}</span>;
}

export default function SendControls({ selectedIds, campaign, settings, resume, onStarted, onChanged, notify }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const c = campaign?.campaign;
  const active = campaign?.active;
  const resumable = campaign?.resumable;
  const pct = c?.total ? Math.round((c.processed / c.total) * 100) : 0;

  async function openConfirm() {
    if (!resume) return notify('Upload your resume first', 'error');
    if (!settings?.dryRun && !settings?.smtpConfigured) return notify('Configure Gmail in backend/.env first', 'error');
    setPreview(null);
    setConfirmOpen(true);
    api.preview(selectedIds[0]).then(setPreview).catch(() => {});
  }

  async function start() {
    setBusy(true);
    try {
      const r = await api.sendBulk(selectedIds);
      notify(`Sending started: ${r.campaign.total} email(s)${r.ineligible ? `, ${r.ineligible} skipped (already sent/invalid)` : ''}`, 'success');
      setConfirmOpen(false);
      onStarted();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const act = (fn, msg) => async () => {
    setBusy(true);
    try {
      await fn();
      if (msg) notify(msg, 'success');
      onChanged();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const delaySec = Math.round((settings?.delayMs || 0) / 1000);
  const etaMin = Math.ceil((selectedIds.length * delaySec) / 60);

  return (
    <div className="card sticky top-2 z-20">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 font-semibold">
            4. Send applications
            {settings?.dryRun ? (
              <span className="badge bg-sky-100 text-sky-700">DRY RUN – nothing is sent</span>
            ) : (
              <span className="badge bg-rose-100 text-rose-700">LIVE – real emails</span>
            )}
          </div>
          <div className="text-xs text-slate-500">
            {selectedIds.length} selected · one email per recruiter (no CC/BCC) · {delaySec}s between emails
          </div>
        </div>

        {!active && !resumable && (
          <button className="btn-primary" disabled={!selectedIds.length || busy} onClick={openConfirm}>
            ▶ Start sending ({selectedIds.length})
          </button>
        )}
        {active && c?.status === 'running' && <button className="btn-secondary" disabled={busy} onClick={act(api.pause, 'Paused')}>⏸ Pause</button>}
        {(c?.status === 'paused' && (active || resumable)) && (
          <button className="btn-primary" disabled={busy} onClick={act(() => api.resumeCampaign(c.id), 'Resumed')}>▶ Resume</button>
        )}
        {(active || resumable) && (
          <button
            className="btn-ghost text-rose-600"
            disabled={busy}
            onClick={() => window.confirm('Stop this campaign? Unsent emails return to pending.') && act(api.stop, 'Stopped')()}
          >
            ■ Stop
          </button>
        )}
      </div>

      {c && (active || resumable || c.finished_at) && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>
              Campaign #{c.id} · <b className="text-slate-700">{c.status}</b>
              {c.dry_run && ' (dry run)'} · {c.processed}/{c.total}
              {campaign.current && <> · sending to {campaign.current.email}</>}
              {campaign.nextSendAt && !campaign.current && <> · <Countdown until={campaign.nextSendAt} /></>}
            </span>
            <span>
              <span className="text-emerald-600">{c.sent} sent</span> · <span className="text-rose-600">{c.failed} failed</span> · {c.skipped} skipped
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full transition-all ${c.status === 'paused' ? 'bg-amber-400' : c.status === 'stopped' ? 'bg-slate-400' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
          </div>
          {c.note && <div className="mt-1 text-xs text-amber-700">{c.note}</div>}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={settings?.dryRun ? 'Start dry run?' : 'Send real emails?'}
        confirmLabel={settings?.dryRun ? `Dry-run ${selectedIds.length} email(s)` : `Send ${selectedIds.length} email(s)`}
        danger={!settings?.dryRun}
        busy={busy}
        onConfirm={start}
        onCancel={() => setConfirmOpen(false)}
      >
        <div className="space-y-3 text-sm">
          <p>
            {settings?.dryRun ? (
              <>Emails will be generated with your resume attached and logged, but <b>nothing will be sent</b>.</>
            ) : (
              <>
                <b>{selectedIds.length}</b> separate email(s) will be sent from <b>{settings?.gmailUser}</b>, one every ~{delaySec}s (about {etaMin} min). Already-sent
                applications are skipped automatically.
              </>
            )}
          </p>
          <div className="text-xs font-medium uppercase text-slate-500">Preview of the first email</div>
          <EmailPreview preview={preview} />
        </div>
      </ConfirmDialog>
    </div>
  );
}
