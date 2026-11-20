/** Subject/body editor with placeholder chips and a live preview. */
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import EmailPreview from './EmailPreview.jsx';

export default function TemplateEditor({ records, notify }) {
  const [tpl, setTpl] = useState(null);
  const [saved, setSaved] = useState(null);
  const [placeholders, setPlaceholders] = useState([]);
  const [previewId, setPreviewId] = useState('');
  const [preview, setPreview] = useState(null);
  const [useText, setUseText] = useState(false);
  const [busy, setBusy] = useState(false);
  const focused = useRef({ field: 'body_html', el: null });

  const load = async () => {
    const t = await api.template();
    const draft = { subject: t.subject, body_html: t.body_html, body_text: t.body_text || '' };
    setTpl(draft);
    setSaved(draft);
    setUseText(Boolean(t.body_text));
    setPlaceholders(t.placeholders);
  };
  useEffect(() => {
    load().catch((e) => notify(e.message, 'error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Live preview of the unsaved draft (debounced).
  useEffect(() => {
    if (!tpl) return undefined;
    const t = setTimeout(() => {
      api
        .preview(previewId || undefined, { ...tpl, body_text: useText ? tpl.body_text : '' })
        .then(setPreview)
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [tpl, previewId, useText]);

  if (!tpl) return <div className="py-8 text-center text-sm text-slate-400">Loading template…</div>;

  const dirty = JSON.stringify(tpl) !== JSON.stringify(saved);

  function insert(ph) {
    const { field, el } = focused.current;
    const token = `{{${ph}}}`;
    const value = tpl[field] ?? '';
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    setTpl({ ...tpl, [field]: value.slice(0, start) + token + value.slice(end) });
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = start + token.length;
      }
    });
  }

  const track = (field) => ({ onFocus: (e) => (focused.current = { field, el: e.target }) });

  async function save() {
    setBusy(true);
    try {
      await api.saveTemplate({ ...tpl, body_text: useText ? tpl.body_text : '' });
      await load();
      notify('Template saved', 'success');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!window.confirm('Reset to the default template? Your changes will be lost.')) return;
    await api.resetTemplate();
    await load();
    notify('Template reset', 'success');
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div>
          <label className="label">Insert placeholder (at cursor)</label>
          <div className="flex flex-wrap gap-1.5">
            {placeholders.map((p) => (
              <button key={p} className="badge cursor-pointer bg-indigo-50 text-indigo-700 hover:bg-indigo-100" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(p)}>
                {`{{${p}}}`}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Subject</label>
          <input className="input" value={tpl.subject} onChange={(e) => setTpl({ ...tpl, subject: e.target.value })} {...track('subject')} />
        </div>
        <div>
          <label className="label">Body (HTML – use &lt;p&gt; for paragraphs, &lt;br&gt; for line breaks)</label>
          <textarea className="input h-72 font-mono text-xs" value={tpl.body_html} onChange={(e) => setTpl({ ...tpl, body_html: e.target.value })} {...track('body_html')} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={useText} onChange={(e) => setUseText(e.target.checked)} />
          Write a custom plain-text version (otherwise generated from HTML)
        </label>
        {useText && (
          <textarea className="input h-48 font-mono text-xs" value={tpl.body_text} onChange={(e) => setTpl({ ...tpl, body_text: e.target.value })} {...track('body_text')} />
        )}
        <div className="flex gap-2">
          <button className="btn-primary" onClick={save} disabled={busy || !dirty}>{dirty ? 'Save template' : 'Saved'}</button>
          {dirty && <button className="btn-secondary" onClick={() => setTpl(saved)}>Discard changes</button>}
          <button className="btn-ghost ml-auto" onClick={reset}>Reset to default</button>
        </div>
      </div>
      <div>
        <label className="label">Preview as</label>
        <select className="input mb-3" value={previewId} onChange={(e) => setPreviewId(e.target.value)}>
          <option value="">Sample recruiter (Jane Doe, Example Corp)</option>
          {records.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name || '(no name)'} – {r.title || '(no title)'} @ {r.company || '(no company)'}
            </option>
          ))}
        </select>
        <EmailPreview preview={preview} />
        {dirty && <p className="mt-2 text-xs text-amber-600">Preview shows unsaved changes. Save before sending.</p>}
      </div>
    </div>
  );
}
