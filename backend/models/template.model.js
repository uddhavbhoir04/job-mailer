/**
 * Email template storage. Two templates:
 *  - main:    used when the recruiter row has a job title and/or company
 *  - generic: used automatically for "email only" rows (no title AND no company),
 *             so those emails don't read "the open role at your company".
 */
import { getDb } from '../config/db.js';

export const DEFAULT_TEMPLATE = {
  name: 'Default job application',
  subject: 'Application for {{Title}} Position at {{Company}}',
  body_html: `<p>Hi {{Name}},</p>
<p>I hope you are doing well.</p>
<p>I am writing to express my interest in the <strong>{{Title}}</strong> position at <strong>{{Company}}</strong>.</p>
<p>I have 3+ years of experience as a Full Stack Developer, working with Node.js, Express.js, React.js, Next.js, JavaScript, REST APIs, and database management.</p>
<p>I would appreciate the opportunity to discuss how my experience and technical skills can contribute to your team.</p>
<p>Please find my resume attached for your consideration.</p>
<p>Looking forward to hearing from you.</p>
<p>Best Regards,<br>{{SenderName}}<br>{{SenderPhone}}<br>{{SenderEmail}}</p>`,
  body_text: '', // empty = auto-generated from the HTML
};

export const DEFAULT_GENERIC_TEMPLATE = {
  name: 'Email-only (no title / company)',
  subject: 'Application for Full-Stack Developer Role – Uddhav Bhoir',
  body_html: `<p>Dear {{Name}},</p>
<p>I’m a Full-Stack Developer with 3+ years of experience building scalable health-tech and fintech applications. I’m writing to express my interest in any suitable Full-Stack Developer, Software Engineer or Node.js / React developer opportunities with your team.</p>
<p>Currently at One Health Assist, I work with Next.js, TypeScript, React, Node.js, Express.js, MySQL and Redis, developing end-to-end features, payment integrations (Razorpay, PhonePe, CCAvenue), webhook handling, and third-party API integrations.</p>
<p>I've also built and deployed two full-stack projects:</p>
<p><strong>HealthSync AI:</strong> <a href="https://healthsync-ai-ten.vercel.app/">https://healthsync-ai-ten.vercel.app/</a></p>
<p><strong>The Roaming Birds:</strong> <a href="https://the-roaming-birds.onrender.com/">https://the-roaming-birds.onrender.com/</a></p>
<p>Please find my resume attached. If there is a current or upcoming opening that matches my profile, I’d appreciate the opportunity to discuss how my skills and experience can contribute to your team.</p>
<p>Best Regards,<br>{{SenderName}}<br>Full-Stack Developer<br>{{SenderPhone}}<br><a href="mailto:uddhavbhoir435@gmail.com">uddhavbhoir435@gmail.com</a><br>LinkedIn: <a href="https://www.linkedin.com/in/uddhav-bhoir-6aa331248/">https://www.linkedin.com/in/uddhav-bhoir-6aa331248/</a></p>`,
  body_text: '',
};

export const TEMPLATE_KINDS = ['main', 'generic'];
const DEFAULTS = { main: DEFAULT_TEMPLATE, generic: DEFAULT_GENERIC_TEMPLATE };

/** Accepts 'main' | 'generic' (and legacy 'default' = main). Returns null for anything else. */
export function normalizeKind(kind) {
  const k = kind === 'default' || !kind ? 'main' : String(kind);
  return TEMPLATE_KINDS.includes(k) ? k : null;
}

export function getTemplate(kind = 'main') {
  const db = getDb();
  const find = () => db.prepare('SELECT * FROM email_templates WHERE kind = ? AND is_default = 1 LIMIT 1').get(kind);
  let row = find();
  if (!row) {
    db.prepare(`INSERT INTO email_templates (name, subject, body_html, body_text, is_default, kind)
                VALUES (@name, @subject, @body_html, @body_text, 1, @kind)`).run({ ...DEFAULTS[kind], kind });
    row = find();
  }
  return row;
}

export function saveTemplate(kind, { subject, body_html: bodyHtml, body_text: bodyText = '', name }) {
  const current = getTemplate(kind);
  getDb()
    .prepare(`UPDATE email_templates SET name = ?, subject = ?, body_html = ?, body_text = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(name || current.name, subject, bodyHtml, bodyText || '', current.id);
  return getTemplate(kind);
}

export const resetTemplate = (kind) => saveTemplate(kind, DEFAULTS[kind]);

/** A row is "email only" when it has neither a job title nor a company. */
export const isEmailOnly = (recruiter) => !String(recruiter?.title ?? '').trim() && !String(recruiter?.company ?? '').trim();

/** Which template kind a recruiter gets. */
export const templateKindFor = (recruiter) => (isEmailOnly(recruiter) ? 'generic' : 'main');

export const templateFor = (recruiter) => getTemplate(templateKindFor(recruiter));

// Backwards-compatible names used elsewhere.
export const getDefaultTemplate = () => getTemplate('main');
export const saveDefaultTemplate = (t) => saveTemplate('main', t);
export const resetDefaultTemplate = () => resetTemplate('main');
