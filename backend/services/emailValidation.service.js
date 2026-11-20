/** Email normalization + validation (syntax, optional MX lookup). */
import dns from 'node:dns/promises';
import validator from 'validator';
import config from '../config/index.js';

export function normalizeEmail(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/^mailto:/i, '')
    .replace(/^[<("']+|[>)"',;.]+$/g, '')
    .replace(/\s+/g, '') // emails never contain spaces; OCR often inserts them ("john. doe@x.com")
    .toLowerCase();
}

const mxCache = new Map();

async function hasMx(domain) {
  if (mxCache.has(domain)) return mxCache.get(domain);
  let ok;
  try {
    ok = (await dns.resolveMx(domain)).length > 0;
  } catch {
    ok = false;
  }
  mxCache.set(domain, ok);
  return ok;
}

/** Returns { email, valid, error }. */
export async function validateEmail(raw, { checkMx = config.validateMx } = {}) {
  const email = normalizeEmail(raw);
  if (!email) return { email, valid: false, error: 'Missing email' };
  if (!validator.isEmail(email, { allow_display_name: false, require_tld: true, allow_utf8_local_part: false })) {
    return { email, valid: false, error: 'Invalid email format' };
  }
  if (checkMx && !(await hasMx(email.split('@')[1]))) {
    return { email, valid: false, error: 'Email domain has no mail server (MX)' };
  }
  return { email, valid: true, error: null };
}
