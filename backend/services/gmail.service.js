/**
 * Gmail sending. Two methods, chosen by config.sendMethod():
 *
 *  - api:  Gmail API over HTTPS (port 443). Works on hosts that block SMTP ports
 *          (Render free plan). Uses an OAuth refresh token (scope gmail.send).
 *  - smtp: smtp.gmail.com:465 with an App Password (fine locally / on paid hosts).
 *
 * Either way the MIME message is built by Nodemailer, so content and attachment
 * are identical. Dry-run builds the message but sends nothing.
 */
import nodemailer from 'nodemailer';
import config, { smtpConfigured, sendMethod } from '../config/index.js';
import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

let smtpTransport;
let dryTransport;
let rawTransport;

const getDryTransport = () => (dryTransport ??= nodemailer.createTransport({ jsonTransport: true }));
// Builds the full RFC 822 message (headers, HTML + text, attachment) as a Buffer.
const getRawTransport = () => (rawTransport ??= nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' }));

const notConfigured = () =>
  sendMethod() === 'api'
    ? 'Gmail API is not configured. Set GMAIL_USER, GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET and GMAIL_OAUTH_REFRESH_TOKEN.'
    : 'Gmail is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in backend/.env';

// ---------------------------------------------------------------- SMTP

function getSmtpTransport() {
  if (!smtpConfigured()) throw new AppError(notConfigured(), 400);
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: config.gmail.user, pass: config.gmail.appPassword },
      pool: true, // reuse one connection for many emails
      maxConnections: 1, // strictly one at a time
      maxMessages: 50,
      connectionTimeout: 20000,
      socketTimeout: 30000,
    });
  }
  return smtpTransport;
}

// ---------------------------------------------------------------- Gmail API

/** Error shaped so classifyError() can handle API and SMTP failures the same way. */
class GmailApiError extends Error {
  constructor(message, status, reason) {
    super(message);
    this.apiStatus = status;
    this.apiReason = reason;
  }
}

let cachedToken = { value: null, expiresAt: 0 };

async function fetchWithTimeout(url, options, ms = 30000) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(ms) });
  } catch (err) {
    const e = new Error(`Network error talking to Google: ${err.message}`);
    e.code = 'ETIMEDOUT';
    throw e;
  }
}

/** Exchanges the long-lived refresh token for a short-lived access token (cached ~1h). */
async function getAccessToken() {
  if (cachedToken.value && Date.now() < cachedToken.expiresAt - 60000) return cachedToken.value;
  const { clientId, clientSecret, refreshToken } = config.gmail.oauth;
  const res = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // invalid_grant = refresh token expired/revoked -> run `npm run gmail:auth` again.
    throw new GmailApiError(`Google OAuth error: ${data.error || res.status} ${data.error_description || ''}`.trim(), 401, data.error);
  }
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

async function sendViaApi(message) {
  const { message: raw } = await getRawTransport().sendMail(message);
  const token = await getAccessToken();
  const res = await fetchWithTimeout('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: raw.toString('base64url') }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = data.error?.errors?.[0]?.reason || data.error?.status || '';
    if (res.status === 401) cachedToken = { value: null, expiresAt: 0 };
    throw new GmailApiError(`Gmail API ${res.status}: ${data.error?.message || res.statusText}`, res.status, reason);
  }
  return { messageId: data.id };
}

// ---------------------------------------------------------------- public API

/** Verifies credentials + connectivity with Gmail for the active method. */
export async function verifySmtp() {
  if (!smtpConfigured()) return { ok: false, error: notConfigured(), method: sendMethod() };
  try {
    if (sendMethod() === 'api') {
      // gmail.send scope can't read the mailbox, so a successful token refresh is the check.
      cachedToken = { value: null, expiresAt: 0 };
      await getAccessToken();
    } else {
      await getSmtpTransport().verify();
    }
    return { ok: true, method: sendMethod() };
  } catch (err) {
    return { ok: false, error: classifyError(err).message, method: sendMethod() };
  }
}

/**
 * Error classification drives retry behaviour:
 *  - temporary: retry with backoff
 *  - quota: Gmail daily limit hit -> pause whole campaign
 *  - auth: bad credentials -> stop whole campaign
 *  - permanent: this recipient failed, move on
 */
export function classifyError(err) {
  // Gmail API errors
  if (err?.apiStatus) {
    const s = err.apiStatus;
    const r = String(err.apiReason || '');
    if (s === 401 || r === 'invalid_grant' || r === 'invalid_client' || r === 'unauthorized_client')
      return {
        type: 'auth',
        message: `Gmail API authorization failed (${r || s}). Run "npm run gmail:auth" again and update GMAIL_OAUTH_REFRESH_TOKEN.`,
      };
    if (s === 429 || /dailyLimitExceeded|userRateLimitExceeded|rateLimitExceeded|quotaExceeded/i.test(r) || /limit exceeded/i.test(err.message))
      return { type: 'quota', message: `Gmail sending limit reached: ${err.message}` };
    if (s === 403 && /insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT|PERMISSION_DENIED/i.test(r))
      return { type: 'auth', message: 'Token lacks the gmail.send permission. Run "npm run gmail:auth" again.' };
    if (s >= 500 || s === 408) return { type: 'temporary', message: err.message };
    return { type: 'permanent', message: err.message };
  }

  // SMTP / network errors
  const code = err?.responseCode;
  const msg = `${err?.response || err?.message || err}`;
  if (code === 535 || code === 534 || err?.code === 'EAUTH')
    return { type: 'auth', message: 'Gmail rejected the login. Check GMAIL_USER and the 16-character App Password.' };
  if ((code === 550 || code === 421) && /5\.4\.5|daily user sending limit|limit exceeded|rate limit/i.test(msg))
    return { type: 'quota', message: `Gmail sending limit reached: ${msg}` };
  if (err?.code === 'ETIMEDOUT' && /connection timeout|greeting/i.test(msg) && sendMethod() === 'smtp')
    return {
      type: 'temporary',
      message: `${msg} (if this happens on Render's free plan, SMTP ports are blocked: use the Gmail API method, see README)`,
    };
  if ((code >= 400 && code < 500) || ['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ECONNRESET', 'EDNS', 'ETLS'].includes(err?.code))
    return { type: 'temporary', message: msg };
  return { type: 'permanent', message: msg };
}

/**
 * Sends ONE email to ONE recipient (never cc/bcc).
 * Returns { messageId, dryRun }.
 */
export async function sendMail({ to, subject, html, text, attachment, senderName, dryRun }) {
  const from = config.gmail.user || 'dry-run@localhost';
  const message = {
    from: senderName ? { name: senderName, address: from } : from,
    to,
    replyTo: from,
    subject,
    html,
    text,
    attachments: attachment ? [attachment] : [],
    headers: {
      'List-Unsubscribe': `<mailto:${from}?subject=unsubscribe>`,
    },
  };
  if (dryRun) {
    const info = await getDryTransport().sendMail(message);
    logger.info(`[DRY RUN] to=${to} subject="${subject}" attachment=${attachment?.filename || 'none'}`);
    return { messageId: info.messageId, dryRun: true };
  }
  if (!smtpConfigured()) throw new AppError(notConfigured(), 400);

  if (sendMethod() === 'api') {
    const { messageId } = await sendViaApi(message);
    logger.info(`Sent (Gmail API) to=${to} id=${messageId}`);
    return { messageId, dryRun: false };
  }

  const info = await getSmtpTransport().sendMail(message);
  if (info.rejected?.length) {
    const e = new Error(`Recipient rejected: ${info.rejected.join(', ')}`);
    e.responseCode = 550;
    throw e;
  }
  logger.info(`Sent (SMTP) to=${to} messageId=${info.messageId}`);
  return { messageId: info.messageId, dryRun: false };
}

export function closeTransport() {
  smtpTransport?.close();
  smtpTransport = undefined;
}
