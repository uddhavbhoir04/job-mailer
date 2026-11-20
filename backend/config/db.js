/**
 * SQLite connection + schema. Uses better-sqlite3 (synchronous, fast, safe for a
 * single-user local app). Schema is idempotent so it runs on every start.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import config from './index.js';

let db;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS recruiters (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  sno              TEXT,
  name             TEXT,
  email            TEXT NOT NULL,
  title            TEXT,
  company          TEXT,
  dedupe_key       TEXT NOT NULL UNIQUE,
  is_valid_email   INTEGER NOT NULL DEFAULT 0,
  validation_error TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
  attempts         INTEGER NOT NULL DEFAULT 0,
  last_error       TEXT,
  sent_at          TEXT,
  message_id       TEXT,
  dry_run_sent     INTEGER NOT NULL DEFAULT 0,
  source_file      TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_recruiters_status ON recruiters(status);
CREATE INDEX IF NOT EXISTS idx_recruiters_email  ON recruiters(email);

CREATE TABLE IF NOT EXISTS suppression_list (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,
  reason     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body_html  TEXT NOT NULL,
  body_text  TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS campaigns (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  status      TEXT NOT NULL,
  total       INTEGER NOT NULL DEFAULT 0,
  sent        INTEGER NOT NULL DEFAULT 0,
  failed      INTEGER NOT NULL DEFAULT 0,
  skipped     INTEGER NOT NULL DEFAULT 0,
  dry_run     INTEGER NOT NULL DEFAULT 1,
  delay_ms    INTEGER NOT NULL,
  batch_size  INTEGER NOT NULL,
  recruiter_ids TEXT NOT NULL,           -- JSON array, allows resume after restart
  note        TEXT,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS email_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  recruiter_id INTEGER,
  campaign_id  INTEGER,
  email        TEXT,
  company      TEXT,
  title        TEXT,
  subject      TEXT,
  status       TEXT NOT NULL,           -- sent | failed | skipped | retry
  error        TEXT,
  message_id   TEXT,
  dry_run      INTEGER NOT NULL DEFAULT 0,
  attempt      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_logs_created ON email_logs(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

export function getDb() {
  if (db) return db;
  if (config.dbFile !== ':memory:') fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
  db = new Database(config.dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

export function closeDb() {
  if (db) db.close();
  db = undefined;
}
