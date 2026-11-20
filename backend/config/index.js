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

const config = {
  port: int(process.env.PORT, 5000),
  host: process.env.HOST || '127.0.0.1',
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',

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
    dataDir: path.join(ROOT_DIR, 'uploads', 'data'),
    resumeDir: path.join(ROOT_DIR, 'uploads', 'resume'),
  },

  validateMx: bool(process.env.VALIDATE_MX, false),
  dbFile: process.env.DB_FILE || path.join(ROOT_DIR, 'data', 'app.db'),
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
