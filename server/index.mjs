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
  res.setHeader("Content-Type", isImage ? row.type : "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Sandbox user content so a malicious SVG/HTML can't run scripts in our origin.
  res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
  res.setHeader(
    "Content-Disposition",
    `${isImage ? "inline" : "attachment"}; filename="${encodeURIComponent(row.name)}"`,
  );
  fs.createReadStream(file).pipe(res);
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

const PORT = process.env.PORT
  ? Number(process.env.PORT)
  : isTest
    ? 8788
    : 8787;
app.listen(PORT, () => {
  console.log(`Journey API listening on http://localhost:${PORT}`);
});
