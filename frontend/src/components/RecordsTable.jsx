/** Extracted records: search, filter, select, inline edit, delete, preview, send one. */
import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { StatusBadge, formatDate } from './ui.jsx';

const EDITABLE = ['sno', 'name', 'email', 'title', 'company'];

function EditRow({ record, onSave, onCancel }) {
  const [form, setForm] = useState(() => Object.fromEntries(EDITABLE.map((k) => [k, record[k] || ''])));
  return (
    <tr className="bg-indigo-50/50">
      <td />
      {EDITABLE.map((k) => (
        <td key={k} className="px-2 py-1.5">
          <input
            className="input py-1"
            value={form[k]}
            onChange={(e) => setForm({ ...form, [k]: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && onSave(form)}
          />
        </td>
      ))}
      <td colSpan={2} className="px-2 py-1.5 text-right whitespace-nowrap">
        <button className="btn-primary py-1" onClick={() => onSave(form)}>Save</button>
        <button className="btn-ghost py-1" onClick={onCancel}>Cancel</button>
      </td>
    </tr>
  );
}

export default function RecordsTable({ records, filters, setFilters, selected, setSelected, onChanged, onPreview, onSendOne, locked, notify }) {
  const [editingId, setEditingId] = useState(null);

  const selectable = useMemo(() => records.filter((r) => r.is_valid_email && ['pending', 'failed'].includes(r.status)), [records]);
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id));

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectable.map((r) => r.id)));

  async function save(id, form) {
    try {
      await api.updateRecruiter(id, form);
      setEditingId(null);
      notify('Record updated', 'success');
      onChanged();
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  async function remove(r) {
    if (!window.confirm(`Delete ${r.email}?`)) return;
    try {
      await api.deleteRecruiter(r.id);
      setSelected((p) => {
        const n = new Set(p);
        n.delete(r.id);
        return n;
      });
      onChanged();
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  async function bulkDelete() {
    if (!window.confirm(`Delete ${selected.size} selected record(s)?`)) return;
    try {
      const { deleted } = await api.bulkDelete([...selected]);
      notify(`${deleted} record(s) deleted`, 'success');
      setSelected(new Set());
      onChanged();
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  async function unsubscribe(r) {
    if (!window.confirm(`Mark ${r.email} as unsubscribed? They will never be emailed by this tool.`)) return;
    await api.unsubscribe(r.id).catch((e) => notify(e.message, 'error'));
    onChanged();
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-xs"
          placeholder="Search name, email, title, company…"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
        <select className="input w-auto" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All statuses</option>
          {['pending', 'queued', 'sending', 'sent', 'failed', 'unsubscribed'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select className="input w-auto" value={filters.valid} onChange={(e) => setFilters({ ...filters, valid: e.target.value })}>
          <option value="">Any email</option>
          <option value="true">Valid emails</option>
          <option value="false">Invalid emails</option>
        </select>
        <div className="ml-auto flex items-center gap-2 text-sm text-slate-500">
          {records.length} shown · {selected.size} selected
          {selected.size > 0 && (
            <button className="btn-ghost text-rose-600" onClick={bulkDelete} disabled={locked}>Delete selected</button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="w-8 px-3 py-2">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!selectable.length || locked} title="Select all sendable" />
              </th>
              <th className="px-2 py-2">SNo</th>
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Email</th>
              <th className="px-2 py-2">Title</th>
              <th className="px-2 py-2">Company</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-slate-400">No records yet. Upload a PDF or Excel file to get started.</td>
              </tr>
            )}
            {records.map((r) =>
              editingId === r.id ? (
                <EditRow key={r.id} record={r} onSave={(f) => save(r.id, f)} onCancel={() => setEditingId(null)} />
              ) : (
                <tr key={r.id} className={`hover:bg-slate-50 ${selected.has(r.id) ? 'bg-indigo-50/40' : ''}`}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      disabled={locked || !r.is_valid_email || !['pending', 'failed'].includes(r.status)}
                    />
                  </td>
                  <td className="px-2 py-2 text-slate-400">{r.sno}</td>
                  <td className="px-2 py-2">{r.name || <span className="text-slate-300 italic">missing</span>}</td>
                  <td className="px-2 py-2">
                    <span className={r.is_valid_email ? '' : 'text-rose-600'}>{r.email}</span>
                    {!r.is_valid_email && <div className="text-xs text-rose-500">{r.validation_error}</div>}
                    {!(r.title || '').trim() && !(r.company || '').trim() && (
                      <div><span className="badge mt-0.5 bg-violet-50 text-violet-700" title="No title or company: the email-only template is used">email-only template</span></div>
                    )}
                  </td>
                  <td className="px-2 py-2">{r.title || <span className="text-slate-300 italic">missing</span>}</td>
                  <td className="max-w-[220px] truncate px-2 py-2" title={r.company}>{r.company || <span className="text-slate-300 italic">missing</span>}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <StatusBadge status={r.status} />
                    {r.dry_run_sent === 1 && r.status !== 'sent' && <span className="badge ml-1 bg-sky-50 text-sky-600" title="Passed a dry run">dry-run ✓</span>}
                    {r.status === 'sent' && <div className="text-xs text-slate-400">{formatDate(r.sent_at)}</div>}
                    {r.status === 'failed' && <div className="max-w-[200px] truncate text-xs text-rose-500" title={r.last_error}>{r.last_error}</div>}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    <button className="btn-ghost px-2" onClick={() => onPreview(r)} title="Preview email">👁</button>
                    <button
                      className="btn-ghost px-2"
                      onClick={() => onSendOne(r)}
                      disabled={locked || !r.is_valid_email || r.status === 'unsubscribed'}
                      title={r.status === 'sent' ? 'Already sent' : 'Send this email'}
                    >
                      ✉️
                    </button>
                    <button className="btn-ghost px-2" onClick={() => setEditingId(r.id)} disabled={locked || r.status === 'sent'} title="Edit">✏️</button>
                    <button className="btn-ghost px-2" onClick={() => unsubscribe(r)} disabled={r.status === 'unsubscribed'} title="Mark unsubscribed / do not contact">🚫</button>
                    <button className="btn-ghost px-2" onClick={() => remove(r)} disabled={locked} title="Delete">🗑</button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
