/**
 * Password gate for the API. The dashboard sends `Authorization: Bearer <APP_PASSWORD>`
 * on every request. Without this, anyone who finds the deployed backend URL could read
 * your recruiter list, download your resume and send email from your Gmail.
 */
import crypto from 'node:crypto';
import config from '../config/index.js';

const OPEN_PATHS = new Set(['/health']);

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

/** Constant-time comparison (hashing first makes the lengths equal). */
const matches = (given) => crypto.timingSafeEqual(sha(given), sha(config.appPassword));

export function requireAuth(req, res, next) {
  if (!config.appPassword || OPEN_PATHS.has(req.path) || req.method === 'OPTIONS') return next();
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token && matches(token)) return next();
  // Small delay slows down password guessing.
  setTimeout(() => res.status(401).json({ error: 'Login required' }), 500);
}
