/** Renders a preview returned by POST /api/templates/preview. */
import { useState } from 'react';

export default function EmailPreview({ preview }) {
  const [mode, setMode] = useState('html');
  if (!preview) return <div className="py-8 text-center text-sm text-slate-400">Loading preview…</div>;
  return (
    <div className="text-sm">
      <dl className="mb-3 grid grid-cols-[80px_1fr] gap-y-1 rounded-lg bg-slate-50 p-3">
        <dt className="text-slate-500">From</dt>
        <dd>{preview.from || <span className="text-rose-600">Gmail not configured</span>}</dd>
        <dt className="text-slate-500">To</dt>
        <dd>{preview.to}</dd>
        <dt className="text-slate-500">Template</dt>
        <dd>{preview.templateKind === 'generic' ? 'Email-only (no title / company)' : 'Main'}</dd>
        <dt className="text-slate-500">Subject</dt>
        <dd className="font-medium">{preview.subject}</dd>
        <dt className="text-slate-500">Attachment</dt>
        <dd>{preview.attachment ? `📎 ${preview.attachment}` : <span className="text-rose-600">No resume uploaded</span>}</dd>
      </dl>
      {preview.warnings?.length > 0 && (
        <ul className="mb-3 list-inside list-disc rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          {preview.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
      <div className="mb-2 flex gap-1">
        {['html', 'text'].map((m) => (
          <button key={m} className={m === mode ? 'btn-secondary py-1' : 'btn-ghost py-1'} onClick={() => setMode(m)}>
            {m === 'html' ? 'HTML' : 'Plain text'}
          </button>
        ))}
      </div>
      {mode === 'html' ? (
        // Sandboxed iframe: template HTML is rendered in isolation from the dashboard.
        <iframe title="Email preview" sandbox="" className="h-96 w-full rounded-lg border border-slate-200 bg-white" srcDoc={`<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#222;padding:8px">${preview.html}</div>`} />
      ) : (
        <pre className="h-96 overflow-auto rounded-lg border border-slate-200 bg-white p-3 font-sans whitespace-pre-wrap">{preview.text}</pre>
      )}
    </div>
  );
}
