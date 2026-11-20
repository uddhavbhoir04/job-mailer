/**
 * Renders a template for one recruiter.
 * Placeholders: {{Name}} {{Title}} {{Company}} {{SNo}} {{Email}}
 *               {{SenderName}} {{SenderPhone}} {{SenderEmail}}   (case-insensitive)
 */

export const PLACEHOLDERS = ['Name', 'Title', 'Company', 'SNo', 'Email', 'SenderName', 'SenderPhone', 'SenderEmail'];

const FALLBACKS = { name: 'Hiring Manager', title: 'open', company: 'your company' };

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Very small HTML -> text conversion for the plain-text alternative part. */
export function htmlToText(html) {
  return String(html ?? '')
    .replace(/\r/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildValues(recruiter, sender) {
  const firstName = (recruiter.name || '').trim();
  return {
    name: firstName || FALLBACKS.name,
    title: (recruiter.title || '').trim() || FALLBACKS.title,
    company: (recruiter.company || '').trim() || FALLBACKS.company,
    sno: String(recruiter.sno ?? ''),
    email: recruiter.email || '',
    sendername: sender.senderName || '',
    senderphone: sender.senderPhone || '',
    senderemail: sender.senderEmail || '',
  };
}

function fill(str, values, { html }) {
  const unknown = new Set();
  const out = String(str ?? '').replace(/\{\{\s*([A-Za-z]+)\s*\}\}/g, (_, key) => {
    const v = values[key.toLowerCase()];
    if (v === undefined) {
      unknown.add(key);
      return '';
    }
    return html ? escapeHtml(v) : v;
  });
  return { out, unknown: [...unknown] };
}

/**
 * Returns { subject, html, text, warnings }.
 * warnings list missing data fields (fallback used) and unknown placeholders.
 */
export function renderEmail(template, recruiter, sender) {
  const values = buildValues(recruiter, sender);
  const subject = fill(template.subject, values, { html: false });
  const html = fill(template.body_html, values, { html: true });
  const text = template.body_text?.trim()
    ? fill(template.body_text, values, { html: false })
    : { out: htmlToText(html.out), unknown: [] };

  const warnings = [];
  for (const f of ['name', 'title', 'company']) if (!(recruiter[f] || '').trim()) warnings.push(`Missing ${f}; using "${FALLBACKS[f]}"`);
  const unknown = [...new Set([...subject.unknown, ...html.unknown, ...text.unknown])];
  if (unknown.length) warnings.push(`Unknown placeholders removed: ${unknown.map((u) => `{{${u}}}`).join(', ')}`);
  if (!sender.senderName) warnings.push('Sender name is not set (Settings)');

  return { subject: subject.out.replace(/\s+/g, ' ').trim(), html: html.out, text: text.out, warnings };
}
