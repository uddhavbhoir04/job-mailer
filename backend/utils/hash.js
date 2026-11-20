import crypto from 'node:crypto';

const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Unique identifier for one application: the same recruiter email + company + title
 * is considered the same application and can never be inserted (or sent) twice.
 */
export const dedupeKey = ({ email, company, title }) =>
  crypto.createHash('sha256').update(`${norm(email)}|${norm(company)}|${norm(title)}`).digest('hex');
