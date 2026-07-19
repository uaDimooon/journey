// Journey backend: Express + node:sqlite. Provides email/password auth with
// scrypt-hashed passwords and httpOnly session cookies, plus per-user graph
// storage. No external services required.

import express from "express";
import cookieParser from "cookie-parser";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { createTelegram } from "./telegram.mjs";
import { createAI } from "./ai.mjs";
// Load environment variables from a local .env file if present (gitignored).
try {
  process.loadEnvFile();
} catch {
  // No .env file — fall back to the ambient environment.
}

// Environment: "development" (default), "test", or "production".
// JOURNEY_ENV takes precedence, then NODE_ENV.
const env = process.env.JOURNEY_ENV || process.env.NODE_ENV || "development";
const isProd = env === "production";
const isTest = env === "test";

// --- Database ---------------------------------------------------------------
// Store the DB OUTSIDE the repo by default so `git clean` / `rm -rf` inside the
// working tree can't wipe it. Test mode uses a dedicated DB so automated tests
// never touch real data. Override the path with JOURNEY_DB_PATH.
const defaultDbName = isTest ? "journey-test.db" : "journey.db";
const dbPath =
  process.env.JOURNEY_DB_PATH ||
  path.join(os.homedir(), ".journey", defaultDbName);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
console.log(`Journey DB (${env}): ${dbPath}`);

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
db.exec("CREATE INDEX IF NOT EXISTS idx_attachments_user ON attachments(user_id);");

// Telegram integration: link a Journey account to a Telegram user, plus the
// short-lived codes used to establish that link and a small key/value store
// for bot state (e.g. the getUpdates offset).
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
// Migration: add media_group_id to older telegram_inbox tables that predate it.
{
  const cols = db
    .prepare("PRAGMA table_info(telegram_inbox)")
    .all()
    .map((c) => c.name);
  if (!cols.includes("media_group_id")) {
    db.exec("ALTER TABLE telegram_inbox ADD COLUMN media_group_id TEXT");
  }
  // AI enrichment columns (title/description/steps suggested from caption+transcript).
  if (!cols.includes("ai_status")) {
    db.exec("ALTER TABLE telegram_inbox ADD COLUMN ai_status TEXT DEFAULT 'none'");
    db.exec("ALTER TABLE telegram_inbox ADD COLUMN ai_title TEXT");
    db.exec("ALTER TABLE telegram_inbox ADD COLUMN ai_description TEXT");
    db.exec("ALTER TABLE telegram_inbox ADD COLUMN ai_steps TEXT");
  }
}
// A single inbox item can carry several attachments (e.g. a forwarded album).
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
// Instagram inbox: reel/post links shared via the bot (its own mailbox).
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

// Files are stored on disk next to the DB (outside the repo), one file per id.
const filesDir = path.join(path.dirname(dbPath), "attachments");
fs.mkdirSync(filesDir, { recursive: true });

const SESSION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

// --- Helpers ----------------------------------------------------------------
function uid() {
  return randomBytes(16).toString("hex");
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const test = scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(test, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function setSession(res, userId) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_MS;
  db.prepare(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
  ).run(token, userId, expiresAt);
  res.cookie("sid", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    maxAge: SESSION_MS,
    path: "/",
  });
}

function currentUser(req) {
  const token = req.cookies?.sid;
  if (!token) return null;
  const session = db
    .prepare("SELECT user_id, expires_at FROM sessions WHERE token = ?")
    .get(token);
  if (!session) return null;
  if (session.expires_at < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  return db
    .prepare("SELECT id, email FROM users WHERE id = ?")
    .get(session.user_id);
}

function requireUser(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  req.user = user;
  next();
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// One-time migration: fold any legacy single-graph rows into a "My Journey".
for (const row of db.prepare("SELECT user_id, data, updated_at FROM graphs").all()) {
  const has = db
    .prepare("SELECT 1 FROM journeys WHERE user_id = ? LIMIT 1")
    .get(row.user_id);
  if (!has) {
    db.prepare(
      "INSERT INTO journeys (id, user_id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(uid(), row.user_id, "My Journey", row.data, row.updated_at, row.updated_at);
  }
}

// --- App --------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: "4mb" }));
app.use(cookieParser());

// Telegram integration (disabled unless a bot token is set). The test
// environment uses a separate token var so it never hijacks the real bot
// (only one process may poll a given bot at a time).
const telegramToken = isTest
  ? process.env.TELEGRAM_TEST_BOT_TOKEN
  : process.env.TELEGRAM_BOT_TOKEN;
// Optional AI enrichment (OpenAI). Disabled cleanly when the key is unset.
const ai = createAI({
  apiKey: process.env.OPENAI_API_KEY ?? null,
  model: process.env.OPENAI_MODEL || "gpt-4o-mini",
});
const telegram = createTelegram({
  db,
  filesDir,
  uid,
  token: telegramToken ?? null,
  maxFileBytes: 20 * 1024 * 1024,
  ai,
});

app.post("/api/auth/signup", (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email." });
  }
  if (password.length < 8) {
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters." });
  }
  const existing = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(email);
  if (existing) {
    return res.status(409).json({ error: "That email is already registered." });
  }
  const id = uid();
  db.prepare(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
  ).run(id, email, hashPassword(password), Date.now());
  setSession(res, id);
  res.json({ user: { id, email } });
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  setSession(res, user.id);
  res.json({ user: { id: user.id, email: user.email } });
});

app.post("/api/auth/logout", (req, res) => {
  const token = req.cookies?.sid;
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  res.clearCookie("sid", { path: "/" });
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  res.json({ user });
});

const NAME_MAX = 100;

function cleanName(raw, fallback = "Untitled journey") {
  const name = String(raw ?? "").trim().slice(0, NAME_MAX);
  return name || fallback;
}

function validGraph(graph) {
  return graph && typeof graph === "object" && graph.nodes && typeof graph.nodes === "object";
}

// List the user's journeys (most recently updated first).
app.get("/api/journeys", requireUser, (req, res) => {
  const rows = db
    .prepare(
      "SELECT id, name, updated_at FROM journeys WHERE user_id = ? ORDER BY updated_at DESC",
    )
    .all(req.user.id);
  res.json({
    journeys: rows.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updated_at })),
  });
});

// Create a new journey with an initial graph.
app.post("/api/journeys", requireUser, (req, res) => {
  const graph = req.body?.graph;
  if (!validGraph(graph)) {
    return res.status(400).json({ error: "Invalid graph payload." });
  }
  const name = cleanName(req.body?.name);
  const id = uid();
  const now = Date.now();
  db.prepare(
    "INSERT INTO journeys (id, user_id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, req.user.id, name, JSON.stringify(graph), now, now);
  res.json({ journey: { id, name, updatedAt: now } });
});

// Get one journey (with its graph).
app.get("/api/journeys/:id", requireUser, (req, res) => {
  const row = db
    .prepare(
      "SELECT id, name, data, updated_at FROM journeys WHERE id = ? AND user_id = ?",
    )
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "Journey not found." });
  res.json({
    journey: { id: row.id, name: row.name, updatedAt: row.updated_at },
    graph: JSON.parse(row.data),
  });
});

// Save a journey's graph.
app.put("/api/journeys/:id", requireUser, (req, res) => {
  const graph = req.body?.graph;
  if (!validGraph(graph)) {
    return res.status(400).json({ error: "Invalid graph payload." });
  }
  const now = Date.now();
  const result = db
    .prepare(
      "UPDATE journeys SET data = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    )
    .run(JSON.stringify(graph), now, req.params.id, req.user.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Journey not found." });
  }
  res.json({ ok: true, updatedAt: now });
});

// Rename a journey.
app.patch("/api/journeys/:id", requireUser, (req, res) => {
  const name = cleanName(req.body?.name, "");
  if (!name) return res.status(400).json({ error: "Name is required." });
  const result = db
    .prepare(
      "UPDATE journeys SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    )
    .run(name, Date.now(), req.params.id, req.user.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Journey not found." });
  }
  res.json({ ok: true, name });
});

// Delete a journey.
app.delete("/api/journeys/:id", requireUser, (req, res) => {
  const result = db
    .prepare("DELETE FROM journeys WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.user.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Journey not found." });
  }
  res.json({ ok: true });
});

// --- Attachments (files & images) ------------------------------------------
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
const rawBody = express.raw({ type: () => true, limit: MAX_FILE_BYTES });

// Upload a file. Body is the raw bytes; name via ?name=, type via Content-Type.
app.post("/api/attachments", requireUser, rawBody, (req, res) => {
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.length === 0) {
    return res.status(400).json({ error: "Empty file." });
  }
  const name = String(req.query.name || "file").slice(0, 200);
  const type = String(req.headers["content-type"] || "application/octet-stream").slice(0, 100);
  const id = uid();
  fs.writeFileSync(path.join(filesDir, id), buf);
  db.prepare(
    "INSERT INTO attachments (id, user_id, name, type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, req.user.id, name, type, buf.length, Date.now());
  res.json({ attachment: { id, name, type, size: buf.length } });
});

// Serve a file (owner only). Images render inline; everything else downloads.
app.get("/api/attachments/:id", requireUser, (req, res) => {
  const row = db
    .prepare("SELECT * FROM attachments WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "Not found." });
  const file = path.join(filesDir, row.id);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "File missing." });
  const isImage = row.type.startsWith("image/");
  const isPdf = row.type === "application/pdf";
  const inline = isImage || isPdf;
  res.setHeader("Content-Type", inline ? row.type : "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Sandbox user content so a malicious SVG/HTML can't run scripts in our origin.
  // PDFs are rendered in-app via PDF.js (canvas), so the sandbox is safe here too.
  res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
  res.setHeader(
    "Content-Disposition",
    `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(row.name)}"`,
  );
  fs.createReadStream(file).pipe(res);
});

// Duplicate a file into a brand-new, independent attachment (used when copying
// an attachment or trait between traits so the two references never share bytes).
app.post("/api/attachments/:id/duplicate", requireUser, (req, res) => {
  const row = db
    .prepare("SELECT * FROM attachments WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "Not found." });
  const src = path.join(filesDir, row.id);
  if (!fs.existsSync(src)) return res.status(404).json({ error: "File missing." });
  const id = uid();
  fs.copyFileSync(src, path.join(filesDir, id));
  db.prepare(
    "INSERT INTO attachments (id, user_id, name, type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, req.user.id, row.name, row.type, row.size, Date.now());
  res.json({ attachment: { id, name: row.name, type: row.type, size: row.size } });
});

// Delete a file.
app.delete("/api/attachments/:id", requireUser, (req, res) => {
  const row = db
    .prepare("SELECT id FROM attachments WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "Not found." });
  db.prepare("DELETE FROM attachments WHERE id = ?").run(row.id);
  fs.rmSync(path.join(filesDir, row.id), { force: true });
  res.json({ ok: true });
});

// --- Telegram integration ---------------------------------------------------

// Connection status for the current user.
app.get("/api/telegram/status", requireUser, (req, res) => {
  const link = db
    .prepare(
      "SELECT telegram_username, telegram_name, linked_at FROM telegram_links WHERE user_id = ?",
    )
    .get(req.user.id);
  res.json({
    enabled: telegram.enabled,
    botUsername: telegram.getBotUsername(),
    connected: !!link,
    username: link?.telegram_username ?? null,
    name: link?.telegram_name ?? null,
    linkedAt: link?.linked_at ?? null,
  });
});

// Generate a one-time link code and the deep link to press Start in Telegram.
app.post("/api/telegram/link-code", requireUser, (req, res) => {
  if (!telegram.enabled) {
    return res
      .status(503)
      .json({ error: "Telegram is not configured on the server." });
  }
  db.prepare("DELETE FROM telegram_link_codes WHERE user_id = ?").run(
    req.user.id,
  );
  const code = randomBytes(8).toString("hex");
  db.prepare(
    "INSERT INTO telegram_link_codes (code, user_id, created_at) VALUES (?, ?, ?)",
  ).run(code, req.user.id, Date.now());
  const botUsername = telegram.getBotUsername();
  res.json({
    code,
    botUsername,
    deepLink: botUsername ? `https://t.me/${botUsername}?start=${code}` : null,
  });
});

// Unlink the current user's Telegram account.
app.post("/api/telegram/disconnect", requireUser, (req, res) => {
  db.prepare("DELETE FROM telegram_links WHERE user_id = ?").run(req.user.id);
  db.prepare("DELETE FROM telegram_link_codes WHERE user_id = ?").run(
    req.user.id,
  );
  res.json({ ok: true });
});

// List the current user's unprocessed inbox items (newest last).
app.get("/api/telegram/inbox", requireUser, (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, source_name, text, media_kind, tg_date, created_at,
              ai_status, ai_title, ai_description, ai_steps
         FROM telegram_inbox
        WHERE user_id = ? AND status = 'new'
        ORDER BY created_at ASC`,
    )
    .all(req.user.id);
  const mediaStmt = db.prepare(
    `SELECT m.attachment_id, a.name, a.type, a.size
       FROM telegram_inbox_media m
       JOIN attachments a ON a.id = m.attachment_id
      WHERE m.inbox_id = ?
      ORDER BY m.position ASC`,
  );
  const items = rows.map((r) => {
    let steps = [];
    if (r.ai_steps) {
      try {
        steps = JSON.parse(r.ai_steps);
      } catch {
        steps = [];
      }
    }
    return {
      id: r.id,
      source: r.source_name,
      text: r.text,
      mediaKind: r.media_kind,
      date: r.tg_date ? r.tg_date * 1000 : r.created_at,
      attachments: mediaStmt.all(r.id).map((m) => ({
        id: m.attachment_id,
        name: m.name,
        type: m.type,
        size: m.size,
      })),
      ai:
        r.ai_status && r.ai_status !== "none"
          ? {
              status: r.ai_status,
              title: r.ai_title ?? null,
              description: r.ai_description ?? null,
              steps: Array.isArray(steps) ? steps : [],
            }
          : null,
    };
  });
  res.json({ items });
});

// Mark an inbox item as imported (its attachment stays, referenced by the graph).
app.post("/api/telegram/inbox/:id/import", requireUser, (req, res) => {
  const result = db
    .prepare(
      "UPDATE telegram_inbox SET status = 'imported' WHERE id = ? AND user_id = ?",
    )
    .run(req.params.id, req.user.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Inbox item not found." });
  }
  res.json({ ok: true });
});

// Dismiss an inbox item and clean up its (unreferenced) downloaded files.
app.post("/api/telegram/inbox/:id/dismiss", requireUser, (req, res) => {
  const item = db
    .prepare("SELECT id FROM telegram_inbox WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: "Inbox item not found." });
  const media = db
    .prepare("SELECT attachment_id FROM telegram_inbox_media WHERE inbox_id = ?")
    .all(item.id);
  for (const m of media) {
    db.prepare("DELETE FROM attachments WHERE id = ? AND user_id = ?").run(
      m.attachment_id,
      req.user.id,
    );
    fs.rmSync(path.join(filesDir, m.attachment_id), { force: true });
  }
  db.prepare("DELETE FROM telegram_inbox_media WHERE inbox_id = ?").run(item.id);
  db.prepare(
    "UPDATE telegram_inbox SET status = 'dismissed', attachment_id = NULL WHERE id = ?",
  ).run(item.id);
  res.json({ ok: true });
});

// --- Instagram inbox --------------------------------------------------------

app.get("/api/instagram/inbox", requireUser, (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, url, shortcode, media_type, text, tg_date, created_at
         FROM instagram_inbox
        WHERE user_id = ? AND status = 'new'
        ORDER BY created_at ASC`,
    )
    .all(req.user.id);
  const items = rows.map((r) => ({
    id: r.id,
    url: r.url,
    shortcode: r.shortcode,
    mediaType: r.media_type,
    text: r.text,
    date: r.tg_date ? r.tg_date * 1000 : r.created_at,
  }));
  res.json({ items });
});

app.post("/api/instagram/inbox/:id/import", requireUser, (req, res) => {
  const result = db
    .prepare(
      "UPDATE instagram_inbox SET status = 'imported' WHERE id = ? AND user_id = ?",
    )
    .run(req.params.id, req.user.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Inbox item not found." });
  }
  res.json({ ok: true });
});

app.post("/api/instagram/inbox/:id/dismiss", requireUser, (req, res) => {
  const result = db
    .prepare(
      "UPDATE instagram_inbox SET status = 'dismissed' WHERE id = ? AND user_id = ?",
    )
    .run(req.params.id, req.user.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Inbox item not found." });
  }
  res.json({ ok: true });
});

const PORT = process.env.PORT
  ? Number(process.env.PORT)
  : isTest
    ? 8788
    : 8787;
app.listen(PORT, () => {
  console.log(`Journey API listening on http://localhost:${PORT}`);
  telegram.start();
});
