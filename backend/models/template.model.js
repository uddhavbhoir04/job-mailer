/** Email template storage. A single default template is used for sending. */
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
<p>Best Regards,<br>{{SenderName}}<br>{{SenderPhone}}<br>{{SenderEmail}}</p>
<p style="color:#888;font-size:12px">If you'd prefer not to receive emails from me, just reply "unsubscribe" and I won't contact you again.</p>`,
  body_text: '', // empty = auto-generated from the HTML
};

export function getDefaultTemplate() {
  const db = getDb();
  let row = db.prepare('SELECT * FROM email_templates WHERE is_default = 1 LIMIT 1').get();
  if (!row) {
    db.prepare(`INSERT INTO email_templates (name, subject, body_html, body_text, is_default)
                VALUES (@name, @subject, @body_html, @body_text, 1)`).run(DEFAULT_TEMPLATE);
    row = db.prepare('SELECT * FROM email_templates WHERE is_default = 1 LIMIT 1').get();
  }
  return row;
}

export function saveDefaultTemplate({ subject, body_html, body_text = '', name }) {
  const current = getDefaultTemplate();
  getDb()
    .prepare(`UPDATE email_templates SET name = ?, subject = ?, body_html = ?, body_text = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(name || current.name, subject, body_html, body_text || '', current.id);
  return getDefaultTemplate();
}

export function resetDefaultTemplate() {
  return saveDefaultTemplate(DEFAULT_TEMPLATE);
}
