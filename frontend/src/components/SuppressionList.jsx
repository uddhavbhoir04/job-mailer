/** Do-not-contact list: recruiters who replied "unsubscribe" are never emailed again. */
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatDate } from './ui.jsx';

export default function SuppressionList({ onChanged, notify }) {
  const [rows, setRows] = useState([]);
  const [email, setEmail] = useState('');

  const load = () => api.suppressions().then(setRows).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  async function add(e) {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      setRows(await api.addSuppression(email.trim()));
      setEmail('');
      onChanged();
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  async function remove(addr) {
    if (!window.confirm(`Remove ${addr} from the do-not-contact list?`)) return;
    setRows(await api.removeSuppression(addr));
    onChanged();
  }

  return (
    <div className="max-w-2xl">
      <p className="mb-3 text-sm text-slate-600">
        When someone replies asking not to be contacted, add their address here (or use 🚫 in the records table). Suppressed addresses are skipped at send time,
        even if they appear in a future upload.
      </p>
      <form onSubmit={add} className="mb-3 flex gap-2">
        <input className="input" placeholder="email@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn-primary whitespace-nowrap">Add</button>
      </form>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {rows.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-400">Nobody has unsubscribed.</li>}
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <span>
              {r.email} <span className="text-xs text-slate-400">· {r.reason} · {formatDate(r.created_at)}</span>
            </span>
            <button className="btn-ghost text-xs" onClick={() => remove(r.email)}>Remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
