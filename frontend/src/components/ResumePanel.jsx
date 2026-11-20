/** Upload / replace / view / remove the resume PDF attached to every email. */
import { useRef, useState } from 'react';
import { api } from '../api.js';
import { formatDate } from './ui.jsx';

export default function ResumePanel({ resume, maxMb = 5, onChange, notify }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function upload(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) return notify('Resume must be a PDF file', 'error');
    if (file.size > maxMb * 1024 * 1024) return notify(`Resume must be under ${maxMb} MB`, 'error');
    setBusy(true);
    try {
      await api.uploadResume(file);
      notify(resume ? 'Resume replaced' : 'Resume uploaded', 'success');
      onChange();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function view() {
    // Open the tab synchronously (avoids popup blockers), then load the PDF into it.
    const tab = window.open('', '_blank');
    try {
      const url = await api.resumeBlobUrl();
      if (tab) tab.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      tab?.close();
      notify(e.message, 'error');
    }
  }

  async function remove() {
    if (!window.confirm('Remove the resume? Emails cannot be sent without it.')) return;
    await api.deleteResume().catch((e) => notify(e.message, 'error'));
    onChange();
  }

  return (
    <div className="card">
      <h2 className="mb-3 font-semibold">2. Resume (PDF)</h2>
      {resume ? (
        <div className="flex items-center gap-3 rounded-lg bg-emerald-50 p-3">
          <div className="text-2xl">📎</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{resume.originalName}</div>
            <div className="text-xs text-slate-500">
              {(resume.size / 1024).toFixed(0)} KB · {formatDate(resume.uploadedAt)}
            </div>
          </div>
          <button className="btn-ghost" onClick={view}>View</button>
        </div>
      ) : (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No resume uploaded – required before sending.</div>
      )}
      <div className="mt-3 flex gap-2">
        <button className="btn-secondary flex-1" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Uploading…' : resume ? 'Replace resume' : 'Upload resume'}
        </button>
        {resume && <button className="btn-ghost text-rose-600" onClick={remove}>Remove</button>}
      </div>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      <p className="mt-2 text-xs text-slate-400">PDF only, max {maxMb} MB. The same file is attached to every email.</p>
    </div>
  );
}
