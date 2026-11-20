/** Key/value settings persisted in SQLite. Env values act as defaults. */
import { getDb } from '../config/db.js';
import config from '../config/index.js';

export const getSetting = (key, def = null) => {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return def;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
};

export const setSetting = (key, value) =>
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));

export const deleteSetting = (key) => getDb().prepare('DELETE FROM settings WHERE key = ?').run(key);

export const incrementSetting = (key, by = 1) => setSetting(key, (Number(getSetting(key, 0)) || 0) + by);

/** User-editable settings (sender identity + pacing). Credentials are NOT here. */
export const EDITABLE = ['senderName', 'senderPhone', 'delayMs', 'batchSize', 'batchPauseMs', 'dailyLimit', 'dryRun'];

export function getSendSettings() {
  const s = config.sending;
  const dryRunSetting = getSetting('dryRun', s.dryRun);
  return {
    senderName: getSetting('senderName', config.sender.name),
    senderPhone: getSetting('senderPhone', config.sender.phone),
    senderEmail: config.gmail.user,
    delayMs: Number(getSetting('delayMs', s.delayMs)),
    batchSize: Math.max(1, Number(getSetting('batchSize', s.batchSize))),
    batchPauseMs: Number(getSetting('batchPauseMs', s.batchPauseMs)),
    dailyLimit: Number(getSetting('dailyLimit', s.dailyLimit)),
    maxRetries: s.maxRetries,
    // DRY_RUN=true in .env is a hard lock; the UI can only turn dry-run ON, never off.
    dryRun: s.dryRun || Boolean(dryRunSetting),
    dryRunLockedByEnv: s.dryRun,
  };
}
