// Journey backend: Express + node:sqlite. Provides email/password auth with
// scrypt-hashed passwords and httpOnly session cookies, plus per-user graph
// storage. No external services required.

import express from "express";
import cookieParser from "cookie-parser";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { config } from "./config.mjs";
import { openDatabase } from "./db.mjs";
import { createStorage } from "./storage.mjs";
import { createTelegram } from "./telegram.mjs";
import { createAI } from "./ai.mjs";

// --- Wiring -----------------------------------------------------------------
// Config, database, and file storage all come from dedicated modules so the
// data + file backends can be swapped (e.g. Turso/Postgres, S3/R2) without
// touching the routes. See config.mjs / db.mjs / storage.mjs.
console.log(`Journey DB (${config.env}): ${config.dbPath}`);
const db = openDatabase(config.dbPath);
const storage = createStorage({ dir: config.filesDir });
const filesDir = config.filesDir;

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
  const expiresAt = Date.now() + config.sessionMs;
  db.prepare(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
  ).run(token, userId, expiresAt);
  res.cookie("sid", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    maxAge: config.sessionMs,
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

// Unauthenticated liveness probe (used by deploy/health checks and E2E startup).
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Optional AI enrichment (OpenAI). Disabled cleanly when the key is unset.
const ai = createAI({
  apiKey: config.openaiApiKey,
  model: config.openaiModel,
});
// Telegram integration (disabled unless a bot token is set). The test env uses a
// separate token so it never hijacks the real bot (one poller per bot).
const telegram = createTelegram({
  db,
  filesDir,
  uid,
  token: config.telegramToken,
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
  storage.write(id, buf);
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
  if (!storage.exists(row.id))
    return res.status(404).json({ error: "File missing." });
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
  storage.createReadStream(row.id).pipe(res);
});

// Duplicate a file into a brand-new, independent attachment (used when copying
// an attachment or trait between traits so the two references never share bytes).
app.post("/api/attachments/:id/duplicate", requireUser, (req, res) => {
  const row = db
    .prepare("SELECT * FROM attachments WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "Not found." });
  if (!storage.exists(row.id))
    return res.status(404).json({ error: "File missing." });
  const id = uid();
  storage.copy(row.id, id);
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
  storage.remove(row.id);
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
    storage.remove(m.attachment_id);
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

const PORT = config.port;

// Only start listening (and polling Telegram) when run directly, e.g.
// `node server/index.mjs`. When imported by tests, just expose the app + db.
const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  app.listen(PORT, () => {
    console.log(`Journey API listening on http://localhost:${PORT}`);
    telegram.start();
  });
}

export { app, db };
