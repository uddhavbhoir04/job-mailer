/** Upload recruiter data (PDF / XLSX / XLS / CSV) with drag & drop and OCR fallback. */
import { useRef, useState } from 'react';
import { api } from '../api.js';

export default function UploadPanel({ onImported, notify }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [result, setResult] = useState(null);

  async function handle(file) {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await api.uploadRecords(file);
      setResult({ ...r, fileName: file.name });
      notify(r.message, r.requiresOcr ? 'warn' : 'success');
      if (!r.requiresOcr) onImported();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function ocr() {
    setBusy(true);
    try {
      const r = await api.runOcr();
      setResult({ ...r, fileName: `${result?.fileName} (OCR)` });
      notify(`${r.message} Please review OCR results for typos.`, 'success');
      onImported();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2 className="mb-3 font-semibold">1. Recruiter list</h2>
      <div
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition ${
          drag ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400'
        }`}
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handle(e.dataTransfer.files?.[0]);
        }}
      >
        <div className="text-2xl">📄</div>
        <div className="mt-1 font-medium">{busy ? 'Processing…' : 'Upload PDF or Excel'}</div>
        <div className="text-xs text-slate-500">Drop a file or click · .pdf .xlsx .xls .csv · columns: SNo, Name, Email, Title, Company</div>
        <input ref={inputRef} type="file" accept=".pdf,.xlsx,.xls,.csv" className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
      </div>

      {result && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <div className="mb-1 truncate font-medium text-slate-800">{result.fileName}</div>
          {result.requiresOcr ? (
            <div>
              <p className="mb-2 text-amber-700">
                No text layer found – this looks like a scanned PDF. OCR can read it (takes a few seconds per page; the first run downloads language data).
              </p>
              <button className="btn-primary" disabled={busy} onClick={ocr}>
                {busy ? 'Running OCR…' : 'Run OCR'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2 text-center">
              <div><div className="text-base font-semibold text-slate-800">{result.extracted}</div>found</div>
              <div><div className="text-base font-semibold text-emerald-600">{result.inserted}</div>new</div>
              <div><div className="text-base font-semibold text-amber-600">{result.duplicates}</div>duplicates</div>
              <div><div className="text-base font-semibold text-rose-600">{result.invalid}</div>invalid</div>
            </div>
          )}
          {result.skipped?.length > 0 && <div className="mt-2 text-rose-600">{result.skipped.length} row(s) skipped: no email address.</div>}
        </div>
      )}
    </div>
  );
}
