/** Dashboard: wires panels together, polls campaign progress, manages toasts and modals. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import StatsCards from './components/StatsCards.jsx';
import UploadPanel from './components/UploadPanel.jsx';
import ResumePanel from './components/ResumePanel.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import RecordsTable from './components/RecordsTable.jsx';
import TemplateEditor from './components/TemplateEditor.jsx';
import SendControls from './components/SendControls.jsx';
import HistoryTable from './components/HistoryTable.jsx';
import SuppressionList from './components/SuppressionList.jsx';
import EmailPreview from './components/EmailPreview.jsx';
import { Modal, ConfirmDialog, Toasts } from './components/ui.jsx';

const TABS = [
  { id: 'records', label: 'Records' },
  { id: 'template', label: 'Email template' },
  { id: 'history', label: 'History' },
  { id: 'suppressions', label: 'Unsubscribes' },
];

export default function App() {
  const [tab, setTab] = useState('records');
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState(null);
  const [records, setRecords] = useState([]);
  const [filters, setFilters] = useState({ search: '', status: '', valid: '' });
  const [selected, setSelected] = useState(new Set());
  const [campaign, setCampaign] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [backendDown, setBackendDown] = useState(false);
  const [previewFor, setPreviewFor] = useState(null); // { record, preview }
  const [sendOneFor, setSendOneFor] = useState(null); // { record, preview, force }
  const [sendingOne, setSendingOne] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const lastProcessed = useRef(null);

  const notify = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 8000 : 4000);
  }, []);

  const loadRecords = useCallback(() => api.recruiters(filters).then(setRecords).catch(() => {}), [filters]);
  const loadStats = useCallback(() => api.stats().then(setStats).catch(() => {}), []);
  const loadSettings = useCallback(
    () =>
      api
        .settings()
        .then((s) => {
          setSettings(s);
          setBackendDown(false);
        })
        .catch(() => setBackendDown(true)),
    [],
  );

  const refreshAll = useCallback(() => {
    loadRecords();
    loadStats();
    setHistoryKey((k) => k + 1);
  }, [loadRecords, loadStats]);

  useEffect(() => {
    loadSettings();
    loadStats();
  }, [loadSettings, loadStats]);

  // Debounced reload when filters change.
  useEffect(() => {
    const t = setTimeout(loadRecords, 250);
    return () => clearTimeout(t);
  }, [loadRecords]);

  // Poll campaign progress: fast while active, slow otherwise.
  useEffect(() => {
    let timer;
    let cancelled = false;
    const tick = async () => {
      try {
        const c = await api.campaign();
        if (cancelled) return;
        setCampaign(c);
        const processed = c.campaign ? `${c.campaign.id}:${c.campaign.processed}:${c.campaign.status}` : null;
        if (processed !== lastProcessed.current) {
          lastProcessed.current = processed;
          refreshAll();
        }
        timer = setTimeout(tick, c.active ? 1500 : 5000);
      } catch {
        timer = setTimeout(tick, 5000);
      }
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refreshAll]);

  async function openPreview(record) {
    setPreviewFor({ record, preview: null });
    try {
      setPreviewFor({ record, preview: await api.preview(record.id) });
    } catch (e) {
      notify(e.message, 'error');
      setPreviewFor(null);
    }
  }

  async function openSendOne(record) {
    if (!settings?.resume) return notify('Upload your resume first', 'error');
    setSendOneFor({ record, preview: null, force: false });
    api.preview(record.id).then((p) => setSendOneFor((s) => s && { ...s, preview: p })).catch(() => {});
  }

  async function confirmSendOne() {
    setSendingOne(true);
    try {
      const r = await api.sendOne(sendOneFor.record.id, sendOneFor.force);
      notify(r.dryRun ? `Dry run OK for ${sendOneFor.record.email} (not sent)` : `Sent to ${sendOneFor.record.email}`, 'success');
      setSendOneFor(null);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setSendingOne(false);
      refreshAll();
    }
  }

  const locked = Boolean(campaign?.active);
  const selectedIds = [...selected];

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">✉️ Job Application Mailer</h1>
          <p className="text-sm text-slate-500">Upload recruiters → attach resume → preview → send one by one via Gmail</p>
        </div>
        {settings && (
          <div className="flex gap-2 text-xs">
            <span className={`badge ${settings.smtpConfigured ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
              Gmail {settings.smtpConfigured ? 'configured' : 'not configured'}
            </span>
            <span className={`badge ${settings.dryRun ? 'bg-sky-100 text-sky-700' : 'bg-rose-100 text-rose-700'}`}>{settings.dryRun ? 'DRY RUN' : 'LIVE'}</span>
          </div>
        )}
      </header>

      {backendDown && (
        <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          Cannot reach the backend. Start it with <code>cd backend &amp;&amp; npm run dev</code>.
        </div>
      )}

      <StatsCards stats={stats} />

      <div className="grid gap-4 lg:grid-cols-3">
        <UploadPanel onImported={refreshAll} notify={notify} />
        <ResumePanel resume={settings?.resume} maxMb={settings?.maxResumeMb} onChange={loadSettings} notify={notify} />
        <SettingsPanel settings={settings} onChange={loadSettings} notify={notify} />
      </div>

      <SendControls
        selectedIds={selectedIds}
        campaign={campaign}
        settings={settings}
        resume={settings?.resume}
        onStarted={() => {
          setSelected(new Set());
          refreshAll();
        }}
        onChanged={refreshAll}
        notify={notify}
      />

      <div className="card">
        <nav className="mb-4 flex gap-1 border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {tab === 'records' && (
          <RecordsTable
            records={records}
            filters={filters}
            setFilters={setFilters}
            selected={selected}
            setSelected={setSelected}
            onChanged={refreshAll}
            onPreview={openPreview}
            onSendOne={openSendOne}
            locked={locked}
            notify={notify}
          />
        )}
        {tab === 'template' && <TemplateEditor records={records} notify={notify} />}
        {tab === 'history' && <HistoryTable refreshKey={historyKey} />}
        {tab === 'suppressions' && <SuppressionList onChanged={refreshAll} notify={notify} />}
      </div>

      <Modal open={Boolean(previewFor)} title={`Preview – ${previewFor?.record.email}`} onClose={() => setPreviewFor(null)} wide>
        <EmailPreview preview={previewFor?.preview} />
      </Modal>

      <ConfirmDialog
        open={Boolean(sendOneFor)}
        title={settings?.dryRun ? 'Dry-run this email?' : `Send to ${sendOneFor?.record.email}?`}
        confirmLabel={settings?.dryRun ? 'Run dry-run' : 'Send email'}
        danger={!settings?.dryRun}
        busy={sendingOne}
        onConfirm={confirmSendOne}
        onCancel={() => setSendOneFor(null)}
      >
        {sendOneFor?.record.status === 'sent' && (
          <label className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <input type="checkbox" checked={sendOneFor.force} onChange={(e) => setSendOneFor({ ...sendOneFor, force: e.target.checked })} />
            This application was already sent. Tick to deliberately send it again.
          </label>
        )}
        <EmailPreview preview={sendOneFor?.preview} />
      </ConfirmDialog>

      <Toasts toasts={toasts} dismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}
