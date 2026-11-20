import { AppError } from '../utils/errors.js';
import { publicConfig } from '../config/index.js';
import { getStats, getHistory } from '../services/tracking.service.js';
import { getSendSettings, setSetting, EDITABLE } from '../models/settings.model.js';
import { getResumeInfo } from '../services/resume.service.js';

/** GET /api/stats */
export const stats = (req, res) => res.json({ ...getStats(), dailyLimit: getSendSettings().dailyLimit });

/** GET /api/history?status=&limit=&recruiterId= */
export const history = (req, res) => res.json(getHistory(req.query));

/** GET /api/settings – never includes credentials */
export const getSettings = (req, res) =>
  // getSendSettings() goes last: its dryRun includes the dashboard toggle, while
  // publicConfig().dryRun is only the .env default.
  res.json({ ...publicConfig(), ...getSendSettings(), senderEmail: publicConfig().gmailUser, resume: getResumeInfo() });

/** PUT /api/settings */
export function updateSettings(req, res) {
  const body = req.body || {};
  const numeric = { delayMs: [0, 3600000], batchSize: [1, 500], batchPauseMs: [0, 7200000], dailyLimit: [1, 2000] };
  for (const key of EDITABLE) {
    if (body[key] === undefined) continue;
    let value = body[key];
    if (numeric[key]) {
      value = Number(value);
      const [min, max] = numeric[key];
      if (!Number.isFinite(value) || value < min || value > max) throw new AppError(`${key} must be between ${min} and ${max}`, 400);
    } else if (key === 'dryRun') {
      value = Boolean(value);
    } else {
      value = String(value).trim().slice(0, 200);
    }
    setSetting(key, value);
  }
  getSettings(req, res);
}
