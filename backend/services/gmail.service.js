/**
 * Gmail SMTP sending via Nodemailer + App Password.
 * In dry-run mode a JSON transport is used: the full message (with attachment)
 * is built exactly as it would be, but nothing leaves the machine.
 */
import nodemailer from 'nodemailer';
import config, { smtpConfigured } from '../config/index.js';
import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

let smtpTransport;
let dryTransport;

function getSmtpTransport() {
  if (!smtpConfigured()) throw new AppError('Gmail is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in backend/.env', 400);
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

const getDryTransport = () => (dryTransport ??= nodemailer.createTransport({ jsonTransport: true }));

/** Verifies credentials + connectivity with Gmail. */
export async function verifySmtp() {
  if (!smtpConfigured()) return { ok: false, error: 'GMAIL_USER / GMAIL_APP_PASSWORD not set in backend/.env' };
  try {
    await getSmtpTransport().verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: classifyError(err).message };
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
  const code = err?.responseCode;
  const msg = `${err?.response || err?.message || err}`;
  if (code === 535 || code === 534 || err?.code === 'EAUTH')
    return { type: 'auth', message: 'Gmail rejected the login. Check GMAIL_USER and the 16-character App Password.' };
  if ((code === 550 || code === 421) && /5\.4\.5|daily user sending limit|limit exceeded|rate limit/i.test(msg))
    return { type: 'quota', message: `Gmail sending limit reached: ${msg}` };
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
  const info = await getSmtpTransport().sendMail(message);
  if (info.rejected?.length) {
    const e = new Error(`Recipient rejected: ${info.rejected.join(', ')}`);
    e.responseCode = 550;
    throw e;
  }
  logger.info(`Sent to=${to} messageId=${info.messageId}`);
  return { messageId: info.messageId, dryRun: false };
}

export function closeTransport() {
  smtpTransport?.close();
  smtpTransport = undefined;
}
