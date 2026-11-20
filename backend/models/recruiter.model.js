/** Data access for recruiters (one row = one job application). */
import { getDb } from '../config/db.js';

const SORTABLE = new Set(['id', 'sno', 'name', 'email', 'title', 'company', 'status', 'sent_at', 'created_at']);

export function listRecruiters({ search = '', status = '', valid = '', sort = 'id', dir = 'asc' } = {}) {
  const where = [];
  const params = {};
  if (search) {
    where.push('(name LIKE @q OR email LIKE @q OR title LIKE @q OR company LIKE @q)');
    params.q = `%${search}%`;
  }
  if (status) {
    where.push('status = @status');
    params.status = status;
  }
  if (valid === 'true' || valid === 'false') {
    where.push('is_valid_email = @valid');
    params.valid = valid === 'true' ? 1 : 0;
  }
  const orderCol = SORTABLE.has(sort) ? sort : 'id';
  const orderDir = dir === 'desc' ? 'DESC' : 'ASC';
  const sql = `SELECT * FROM recruiters ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
               ORDER BY ${orderCol === 'sno' ? 'CAST(sno AS INTEGER)' : orderCol} ${orderDir}, id ASC`;
  return getDb().prepare(sql).all(params);
}

export const getRecruiter = (id) => getDb().prepare('SELECT * FROM recruiters WHERE id = ?').get(id);

export const getRecruitersByIds = (ids) => {
  if (!ids.length) return [];
  return getDb().prepare(`SELECT * FROM recruiters WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
};

const insertStmt = () =>
  getDb().prepare(`INSERT OR IGNORE INTO recruiters
    (sno, name, email, title, company, dedupe_key, is_valid_email, validation_error, status, source_file)
    VALUES (@sno, @name, @email, @title, @company, @dedupe_key, @is_valid_email, @validation_error, @status, @source_file)`);

/** Inserts many rows in one transaction; returns how many were new vs. duplicates. */
export function insertRecruiters(rows) {
  const stmt = insertStmt();
  let inserted = 0;
  let duplicates = 0;
  getDb().transaction(() => {
    for (const r of rows) {
      const info = stmt.run(r);
      if (info.changes) inserted++;
      else duplicates++;
    }
  })();
  return { inserted, duplicates };
}

export function updateRecruiter(id, fields) {
  const allowed = ['sno', 'name', 'email', 'title', 'company', 'dedupe_key', 'is_valid_email', 'validation_error', 'status', 'last_error'];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!keys.length) return getRecruiter(id);
  getDb()
    .prepare(`UPDATE recruiters SET ${keys.map((k) => `${k} = @${k}`).join(', ')}, updated_at = datetime('now') WHERE id = @id`)
    .run({ ...Object.fromEntries(keys.map((k) => [k, fields[k]])), id });
  return getRecruiter(id);
}

export const deleteRecruiters = (ids) => {
  if (!ids.length) return 0;
  return getDb().prepare(`DELETE FROM recruiters WHERE id IN (${ids.map(() => '?').join(',')}) AND status != 'sending'`).run(...ids).changes;
};

export const findByDedupeKey = (key) => getDb().prepare('SELECT id FROM recruiters WHERE dedupe_key = ?').get(key);

/**
 * Atomically claims a recruiter for sending. Returns true only if the row was in a
 * sendable state. This is the core guarantee against accidental re-sends: a row with
 * status 'sent' can only be claimed with an explicit `force`.
 */
export function claimForSending(id, { force = false } = {}) {
  const states = force ? "('pending','queued','failed','sent')" : "('pending','queued','failed')";
  return (
    getDb()
      .prepare(`UPDATE recruiters SET status = 'sending', attempts = attempts + 1, updated_at = datetime('now')
                WHERE id = ? AND is_valid_email = 1 AND status IN ${states}`)
      .run(id).changes === 1
  );
}

export const markSent = (id, messageId) =>
  getDb()
    .prepare(`UPDATE recruiters SET status = 'sent', sent_at = datetime('now'), message_id = ?, last_error = NULL,
              updated_at = datetime('now') WHERE id = ?`)
    .run(messageId, id);

/** Dry-run success: record is returned to 'pending' so a later real send still goes out. */
export const markDryRun = (id) =>
  getDb()
    .prepare(`UPDATE recruiters SET status = 'pending', dry_run_sent = 1, last_error = NULL, updated_at = datetime('now') WHERE id = ?`)
    .run(id);

export const markFailed = (id, error) =>
  getDb()
    .prepare(`UPDATE recruiters SET status = 'failed', last_error = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(String(error).slice(0, 1000), id);

/** Puts a claimed row back (used on pause/stop/quota) without counting it as failed. */
export const releaseRecruiter = (id, error = null) =>
  getDb()
    .prepare(`UPDATE recruiters SET status = 'pending', last_error = COALESCE(?, last_error), updated_at = datetime('now')
              WHERE id = ? AND status IN ('sending','queued')`)
    .run(error, id);

export const markQueued = (ids) => {
  const stmt = getDb().prepare(`UPDATE recruiters SET status = 'queued' WHERE id = ? AND is_valid_email = 1 AND status IN ('pending','failed')`);
  getDb().transaction(() => ids.forEach((id) => stmt.run(id)))();
};

export const releaseAllQueued = () =>
  getDb().prepare(`UPDATE recruiters SET status = 'pending' WHERE status IN ('queued','sending')`).run().changes;

/** Releases only the given campaign's rows (so a finishing campaign can't touch a newer one). */
export const releaseQueuedIds = (ids) => {
  const stmt = getDb().prepare(`UPDATE recruiters SET status = 'pending' WHERE id = ? AND status IN ('queued','sending')`);
  getDb().transaction(() => ids.forEach((id) => stmt.run(id)))();
};

export const markUnsubscribedByEmail = (email) =>
  getDb().prepare(`UPDATE recruiters SET status = 'unsubscribed', updated_at = datetime('now') WHERE email = ? AND status != 'sent'`).run(email);

export function recruiterStats() {
  return getDb()
    .prepare(`SELECT
        COUNT(*)                                                         AS total,
        SUM(is_valid_email = 1)                                          AS validEmails,
        SUM(is_valid_email = 0)                                          AS invalidEmails,
        SUM(status = 'sent')                                             AS sent,
        SUM(status IN ('pending','queued','sending') AND is_valid_email = 1) AS pending,
        SUM(status = 'failed')                                           AS failed,
        SUM(status = 'unsubscribed')                                     AS unsubscribed,
        SUM(dry_run_sent = 1 AND status != 'sent')                       AS dryRunTested
      FROM recruiters`)
    .get();
}
