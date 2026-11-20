/** Email execution history (every attempt, including retries and skips). */
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { StatusBadge, formatDate } from './ui.jsx';

export default function HistoryTable({ refreshKey }) {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    api.history({ status, limit: 500 }).then(setRows).catch(() => {});
  }, [status, refreshKey]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All events</option>
          {['sent', 'failed', 'retry', 'deferred', 'skipped'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-sm text-slate-500">{rows.length} event(s)</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Recipient</th>
              <th className="px-3 py-2">Company / Title</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-10 text-center text-slate-400">No emails processed yet.</td></tr>
            )}
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2 whitespace-nowrap text-slate-500">{formatDate(l.created_at)}</td>
                <td className="px-3 py-2">{l.email}</td>
                <td className="px-3 py-2">
                  {l.company}
                  <div className="text-xs text-slate-400">{l.title}</div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <StatusBadge status={l.status} />
                  {l.dry_run === 1 && <span className="badge ml-1 bg-sky-50 text-sky-600">dry run</span>}
                  {l.attempt > 1 && <span className="ml-1 text-xs text-slate-400">attempt {l.attempt}</span>}
                </td>
                <td className="max-w-sm truncate px-3 py-2 text-xs text-slate-500" title={l.error || l.message_id || ''}>
                  {l.error || l.message_id}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
