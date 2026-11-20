/** Add recruiters by typing one at a time or pasting a list. */
import { useState } from 'react';
import { api } from '../api.js';
import { Modal } from './ui.jsx';

const EMPTY = { email: '', name: '', title: '', company: '', sno: '' };

const PASTE_EXAMPLE = `hr@company.com
Priya Sharma, priya@company.com
Rahul Mehta, rahul@startup.io, Node.js Developer, Startup Labs`;

function Summary({ result }) {
  if (!result) return null;
  return (
    <div className="mt-3 grid grid-cols-4 gap-2 rounded-lg bg-slate-50 p-3 text-center text-xs text-slate-600">
      <div><div className="text-base font-semibold text-slate-800">{result.extracted}</div>found</div>
      <div><div className="text-base font-semibold text-emerald-600">{result.inserted}</div>added</div>
      <div><div className="text-base font-semibold text-amber-600">{result.duplicates}</div>duplicates</div>
      <div><div className="text-base font-semibold text-rose-600">{result.invalid}</div>invalid</div>
    </div>
  );
}

export default function AddRecordsModal({ open, onClose, onAdded, notify }) {
  const [tab, setTab] = useState('single');
  const [form, setForm] = useState(EMPTY);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const pasteCount = text.split(/\r?\n/).filter((l) => l.includes('@')).length;
  const emailOnly = !form.title.trim() && !form.company.trim();

  async function submit(payload, { keepOpen }) {
    setBusy(true);
    try {
      const r = await api.addRecords(payload);
      setResult(r);
      notify(r.message, r.inserted ? 'success' : 'warn');
      onAdded();
      if (r.inserted) {
        if (tab === 'single') setForm(EMPTY);
        else setText('');
        if (!keepOpen) close();
      }
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setResult(null);
    onClose();
  }

  const single = (keepOpen) => (e) => {
    e?.preventDefault();
    if (!form.email.trim()) return notify('Email is required', 'error');
    submit({ records: [form] }, { keepOpen });
  };

  return (
    <Modal open={open} title="Add recruiters manually" onClose={close}>
      <div className="mb-4 flex gap-1">
        {[
          ['single', 'Type one'],
          ['paste', 'Paste a list'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? 'btn-secondary' : 'btn-ghost'}
            onClick={() => {
              setTab(id);
              setResult(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'single' ? (
        <form onSubmit={single(true)} className="space-y-3">
          <div>
            <label className="label">Email *</label>
            <input className="input" type="email" autoFocus value={form.email} onChange={set('email')} placeholder="recruiter@company.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Recruiter name</label>
              <input className="input" value={form.name} onChange={set('name')} placeholder="Priya Sharma" />
            </div>
            <div>
              <label className="label">Job title</label>
              <input className="input" value={form.title} onChange={set('title')} placeholder="Full Stack Developer" />
            </div>
            <div>
              <label className="label">Company</label>
              <input className="input" value={form.company} onChange={set('company')} placeholder="Acme Technologies" />
            </div>
          </div>
          {form.email && emailOnly && (
            <p className="rounded-lg bg-violet-50 p-2 text-xs text-violet-800">
              No title or company: this recruiter will get your <b>email-only template</b> (edit it in the Email template tab).
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" disabled={busy} onClick={single(true)}>Add &amp; add another</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={single(false)}>{busy ? 'Adding…' : 'Add'}</button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="label">One recruiter per line</label>
            <textarea className="input h-48 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={PASTE_EXAMPLE} />
          </div>
          <p className="text-xs text-slate-500">
            Lines with just an email (no title/company) automatically use your <b>email-only template</b>. Formats: <code>email</code> · <code>Name, email</code> · <code>Name, email, Title, Company</code>. You can also copy rows straight from Excel or Google Sheets
            (header row optional). If a company name contains a comma, paste from a spreadsheet instead.
          </p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">{pasteCount} line(s) with an email</span>
            <button className="btn-primary" disabled={busy || !pasteCount} onClick={() => submit({ text }, { keepOpen: false })}>
              {busy ? 'Adding…' : `Add ${pasteCount || ''} recruiter(s)`}
            </button>
          </div>
        </div>
      )}

      <Summary result={result} />
      {result?.duplicates > 0 && result.inserted === 0 && (
        <p className="mt-2 text-xs text-amber-700">Already in your list (same email + company + title), so nothing was added.</p>
      )}
    </Modal>
  );
}
