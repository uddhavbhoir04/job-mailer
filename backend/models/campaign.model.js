/** Campaign = one "Start sending" run over a set of selected recruiters. */
import { getDb } from '../config/db.js';

const parse = (row) => (row ? { ...row, recruiter_ids: JSON.parse(row.recruiter_ids), dry_run: Boolean(row.dry_run) } : null);

export function createCampaign({ recruiterIds, dryRun, delayMs, batchSize }) {
  const info = getDb()
    .prepare(`INSERT INTO campaigns (status, total, dry_run, delay_ms, batch_size, recruiter_ids)
              VALUES ('running', ?, ?, ?, ?, ?)`)
    .run(recruiterIds.length, dryRun ? 1 : 0, delayMs, batchSize, JSON.stringify(recruiterIds));
  return getCampaign(info.lastInsertRowid);
}

export const getCampaign = (id) => parse(getDb().prepare('SELECT * FROM campaigns WHERE id = ?').get(id));

export const getLatestCampaign = () => parse(getDb().prepare('SELECT * FROM campaigns ORDER BY id DESC LIMIT 1').get());

export function updateCampaign(id, fields) {
  const allowed = ['status', 'sent', 'failed', 'skipped', 'note', 'finished_at'];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!keys.length) return;
  getDb()
    .prepare(`UPDATE campaigns SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`)
    .run({ ...Object.fromEntries(keys.map((k) => [k, fields[k]])), id });
}

/** After a crash/restart, running campaigns can't still be running. */
export const pauseOrphanedCampaigns = () =>
  getDb().prepare(`UPDATE campaigns SET status = 'paused', note = 'Paused: server restarted' WHERE status = 'running'`).run().changes;
