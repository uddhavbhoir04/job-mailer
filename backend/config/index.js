/**
 * Central configuration. This is the ONLY module that reads process.env,
 * so credentials never leak into other layers or API responses.
 */
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');

const bool = (v, def = false) => (v === undefined || v === '' ? def : /^(1|true|yes|on)$/i.test(v));
const int = (v, def) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
};

// Render / Railway / Fly / Heroku set these automatically.
export const onHostingPlatform = Boolean(
  process.env.RENDER || process.env.RAILWAY_ENVIRONMENT || process.env.FLY_APP_NAME || process.env.DYNO,
);
export const isProduction = process.env.NODE_ENV === 'production' || onHostingPlatform;

/**
 * On a hosting platform the server MUST listen on 0.0.0.0, even if HOST=127.0.0.1 was
 * copied from a local .env (the platform could not reach it: "No open ports detected").
 */
function resolveHost() {
  const h = process.env.HOST;
  const loopback = !h || ['127.0.0.1', 'localhost', '::1'].includes(h);
  if (onHostingPlatform && loopback) return '0.0.0.0';
  return h || (isProduction ? '0.0.0.0' : '127.0.0.1');
}

// Where the database and uploads live. Point this at a persistent disk in production.
const DATA_DIR = path.resolve(process.env.DATA_DIR || ROOT_DIR);

const config = {
  port: int(process.env.PORT, 5000),
  // Hosts (Render, Railway…) must reach the server from outside the container -> 0.0.0.0.
  // Locally we stay on 127.0.0.1 so the API is not exposed on your network.
  host: resolveHost(),
  // Comma-separated list of allowed browser origins (your Vercel URL, localhost…).
  frontendOrigins: (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),

  // Password required for every API call (except /api/health). Required in production.
  appPassword: process.env.APP_PASSWORD || '',

  gmail: {
    user: (process.env.GMAIL_USER || '').trim(),
    // Google shows app passwords as "abcd efgh ijkl mnop" – strip the spaces.
    appPassword: (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''),
  },

  sender: {
    name: process.env.SENDER_NAME || '',
    phone: process.env.SENDER_PHONE || '',
  },

  sending: {
    dryRun: bool(process.env.DRY_RUN, true), // safe default: never send unless explicitly disabled
    delayMs: int(process.env.EMAIL_DELAY_MS, 30000),
    batchSize: Math.max(1, int(process.env.BATCH_SIZE, 20)),
    batchPauseMs: int(process.env.BATCH_PAUSE_MS, 120000),
    maxRetries: int(process.env.MAX_RETRIES, 3),
    dailyLimit: int(process.env.DAILY_SEND_LIMIT, 400),
  },

  uploads: {
    maxUploadBytes: int(process.env.MAX_UPLOAD_MB, 10) * 1024 * 1024,
    maxResumeBytes: int(process.env.MAX_RESUME_MB, 5) * 1024 * 1024,
    dataDir: path.join(DATA_DIR, 'uploads', 'data'),
    resumeDir: path.join(DATA_DIR, 'uploads', 'resume'),
  },

  validateMx: bool(process.env.VALIDATE_MX, false),
  dbFile: process.env.DB_FILE || path.join(DATA_DIR, 'data', 'app.db'),
  logDir: path.join(ROOT_DIR, 'logs'),
};

export const smtpConfigured = () => Boolean(config.gmail.user && config.gmail.appPassword);

/** Safe, credential-free view of the config for the frontend. */
export const publicConfig = () => {
  const u = config.gmail.user;
  const masked = u ? u.replace(/^(.{2}).*(@.*)$/, '$1***$2') : null;
  return {
    smtpConfigured: smtpConfigured(),
    gmailUser: masked,
    dryRun: config.sending.dryRun,
    maxUploadMb: config.uploads.maxUploadBytes / 1048576,
    maxResumeMb: config.uploads.maxResumeBytes / 1048576,
  };
};

export default config;
