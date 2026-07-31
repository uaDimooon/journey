// Database connection + schema. Opening the DB, declaring tables/indexes, running
// migrations, and the one-time legacy fold all live here so the rest of the
// server is agnostic to how storage is provisioned. This is the seam to adapt
// when moving off local node:sqlite (e.g. to Turso/libSQL or Postgres).
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Open (creating if needed) the SQLite database at `dbPath`, apply the schema
 *  and migrations, and return the connection. */
export function openDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");

  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS graphs (
    user_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS journeys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_journeys_user ON journeys(user_id);");
  db.exec(`CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );`);
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_attachments_user ON attachments(user_id);",
  );

  // Telegram: account links, one-time link codes, bot key/value state.
  db.exec(`CREATE TABLE IF NOT EXISTS telegram_links (
    user_id TEXT PRIMARY KEY,
    telegram_user_id TEXT UNIQUE NOT NULL,
    telegram_username TEXT,
    telegram_name TEXT,
    linked_at INTEGER NOT NULL
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS telegram_link_codes (
    code TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS telegram_state (
    key TEXT PRIMARY KEY,
    value TEXT
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS telegram_inbox (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    source_name TEXT,
    text TEXT,
    attachment_id TEXT,
    media_kind TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    tg_message_id INTEGER,
    tg_date INTEGER,
    media_group_id TEXT,
    created_at INTEGER NOT NULL
  );`);
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_tg_inbox_user ON telegram_inbox(user_id, status);",
  );

  // Migration: add columns to older telegram_inbox tables that predate them.
  {
    const cols = db
      .prepare("PRAGMA table_info(telegram_inbox)")
      .all()
      .map((c) => c.name);
    if (!cols.includes("media_group_id")) {
      db.exec("ALTER TABLE telegram_inbox ADD COLUMN media_group_id TEXT");
    }
    if (!cols.includes("ai_status")) {
      db.exec("ALTER TABLE telegram_inbox ADD COLUMN ai_status TEXT DEFAULT 'none'");
      db.exec("ALTER TABLE telegram_inbox ADD COLUMN ai_title TEXT");
      db.exec("ALTER TABLE telegram_inbox ADD COLUMN ai_description TEXT");
      db.exec("ALTER TABLE telegram_inbox ADD COLUMN ai_steps TEXT");
    }
  }

  db.exec(`CREATE TABLE IF NOT EXISTS telegram_inbox_media (
    id TEXT PRIMARY KEY,
    inbox_id TEXT NOT NULL,
    attachment_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );`);
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_tg_inbox_media ON telegram_inbox_media(inbox_id);",
  );
  db.exec(`CREATE TABLE IF NOT EXISTS instagram_inbox (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    shortcode TEXT,
    media_type TEXT,
    text TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    tg_date INTEGER,
    created_at INTEGER NOT NULL
  );`);
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_ig_inbox_user ON instagram_inbox(user_id, status);",
  );

  // One-time migration: fold any legacy single-graph rows into a "My Journey".
  for (const row of db
    .prepare("SELECT user_id, data, updated_at FROM graphs")
    .all()) {
    const has = db
      .prepare("SELECT 1 FROM journeys WHERE user_id = ? LIMIT 1")
      .get(row.user_id);
    if (!has) {
      db.prepare(
        "INSERT INTO journeys (id, user_id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(
        randomBytes(16).toString("hex"),
        row.user_id,
        "My Journey",
        row.data,
        row.updated_at,
        row.updated_at,
      );
    }
  }

  return db;
}
