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
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";

// --- Database ---------------------------------------------------------------
const db = new DatabaseSync(path.join(__dirname, "journey.db"));
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

app.get("/api/graph", requireUser, (req, res) => {
  const row = db
    .prepare("SELECT data FROM graphs WHERE user_id = ?")
    .get(req.user.id);
  res.json({ graph: row ? JSON.parse(row.data) : null });
});

app.put("/api/graph", requireUser, (req, res) => {
  const graph = req.body?.graph;
  if (!graph || typeof graph !== "object" || !graph.nodes) {
    return res.status(400).json({ error: "Invalid graph payload." });
  }
  const data = JSON.stringify(graph);
  db.prepare(
    `INSERT INTO graphs (user_id, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(req.user.id, data, Date.now());
  res.json({ ok: true });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
app.listen(PORT, () => {
  console.log(`Journey API listening on http://localhost:${PORT}`);
});
