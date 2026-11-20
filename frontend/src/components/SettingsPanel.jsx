/** Sender identity + pacing settings, Gmail status and dry-run toggle. */
import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function SettingsPanel({ settings, onChange, notify }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [smtp, setSmtp] = useState(null);

  useEffect(() => {
    if (settings) {
      setForm({
        senderName: settings.senderName || '',
        senderPhone: settings.senderPhone || '',
        delaySec: Math.round(settings.delayMs / 1000),
        batchSize: settings.batchSize,
        batchPauseSec: Math.round(settings.batchPauseMs / 1000),
        dailyLimit: settings.dailyLimit,
      });
    }
  }, [settings]);

  if (!form) return <div className="card text-sm text-slate-400">Loading settings…</div>;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    try {
      await api.saveSettings({
        senderName: form.senderName,
        senderPhone: form.senderPhone,
        delayMs: Number(form.delaySec) * 1000,
        batchSize: Number(form.batchSize),
        batchPauseMs: Number(form.batchPauseSec) * 1000,
        dailyLimit: Number(form.dailyLimit),
      });
      notify('Settings saved', 'success');
      onChange();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleDryRun(value) {
    if (!value && !window.confirm('Turn OFF dry-run? Emails will really be sent through Gmail.')) return;
    try {
      await api.saveSettings({ dryRun: value });
      onChange();
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  async function verify() {
    setSmtp({ checking: true });
    const r = await api.verifySmtp().catch((e) => ({ ok: false, error: e.message }));
    setSmtp(r);
  }

  return (
    <div className="card">
      <h2 className="mb-3 font-semibold">3. Sender &amp; sending</h2>

      <div className="mb-3 rounded-lg bg-slate-50 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span>
            Gmail:{' '}
            {settings.smtpConfigured ? <b>{settings.gmailUser}</b> : <span className="text-rose-600">not configured in backend/.env</span>}
          </span>
          <button className="btn-ghost text-xs" onClick={verify} disabled={!settings.smtpConfigured || smtp?.checking}>
            {smtp?.checking ? 'Checking…' : 'Verify SMTP'}
          </button>
        </div>
        {smtp && !smtp.checking && (
          <div className={`mt-1 text-xs ${smtp.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{smtp.ok ? '✓ Connected to Gmail' : smtp.error}</div>
        )}
        <label className="mt-2 flex items-center gap-2">
          <input type="checkbox" checked={settings.dryRun} disabled={settings.dryRunLockedByEnv} onChange={(e) => toggleDryRun(e.target.checked)} />
          <span>
            Dry-run mode <span className="text-xs text-slate-500">(build emails, send nothing)</span>
          </span>
        </label>
        {settings.dryRunLockedByEnv && <div className="text-xs text-slate-500">Locked on by DRY_RUN=true in backend/.env</div>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="label">Your name</label>
          <input className="input" value={form.senderName} onChange={set('senderName')} placeholder="Jane Doe" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="label">Contact number</label>
          <input className="input" value={form.senderPhone} onChange={set('senderPhone')} placeholder="+91 98765 43210" />
        </div>
        <div>
          <label className="label">Delay between emails (s)</label>
          <input className="input" type="number" min="0" value={form.delaySec} onChange={set('delaySec')} />
        </div>
        <div>
          <label className="label">Daily limit</label>
          <input className="input" type="number" min="1" max="2000" value={form.dailyLimit} onChange={set('dailyLimit')} />
        </div>
        <div>
          <label className="label">Batch size</label>
          <input className="input" type="number" min="1" value={form.batchSize} onChange={set('batchSize')} />
        </div>
        <div>
          <label className="label">Pause after batch (s)</label>
          <input className="input" type="number" min="0" value={form.batchPauseSec} onChange={set('batchPauseSec')} />
        </div>
      </div>
      <button className="btn-primary mt-3 w-full" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save settings'}
      </button>
      <p className="mt-2 text-xs text-slate-400">Gmail allows roughly 500 emails/day for personal accounts. A 30–60s delay keeps you well clear of spam filters.</p>
    </div>
  );
}
