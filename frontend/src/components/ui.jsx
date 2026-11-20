/** Small shared UI pieces: modal, confirm dialog, status badge, toasts. */
import { useEffect } from 'react';

export function Modal({ open, title, onClose, children, footer, wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={onClose}>
      <div
        className={`flex max-h-[90vh] w-full flex-col rounded-xl bg-white shadow-xl ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button className="btn-ghost px-2" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, children, confirmLabel = 'Confirm', danger, busy, onConfirm, onCancel }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

const STATUS_STYLES = {
  pending: 'bg-slate-100 text-slate-700',
  queued: 'bg-sky-100 text-sky-700',
  sending: 'bg-amber-100 text-amber-800',
  sent: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
  skipped: 'bg-slate-100 text-slate-500',
  retry: 'bg-amber-100 text-amber-800',
  deferred: 'bg-amber-100 text-amber-800',
  unsubscribed: 'bg-purple-100 text-purple-700',
};

export const StatusBadge = ({ status, children }) => (
  <span className={`badge ${STATUS_STYLES[status] || 'bg-slate-100 text-slate-600'}`}>{children || status}</span>
);

export function Toasts({ toasts, dismiss }) {
  return (
    <div className="fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-lg border px-4 py-3 text-sm shadow-lg ${
            t.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : t.type === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <span>{t.message}</span>
            <button className="text-xs opacity-60 hover:opacity-100" onClick={() => dismiss(t.id)}>✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export const formatDate = (s) => {
  if (!s) return '';
  // SQLite datetime('now') is UTC without a zone marker.
  const d = new Date(/Z|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString();
};
