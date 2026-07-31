// Centralized configuration (12-factor: everything comes from the environment).
// Import this first so `.env` is loaded before any other module reads env vars.
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

// Load variables from a local .env file if present (gitignored); otherwise fall
// back to the ambient environment.
try {
  process.loadEnvFile();
} catch {
  /* no .env file */
}

const env = process.env.JOURNEY_ENV || process.env.NODE_ENV || "development";
const isProd = env === "production";
const isTest = env === "test";

// Store the DB OUTSIDE the repo by default so `git clean` / `rm -rf` in the
// working tree can't wipe it. Test mode uses a dedicated DB. Override with
// JOURNEY_DB_PATH. Attachments live next to the DB.
const defaultDbName = isTest ? "journey-test.db" : "journey.db";
const dbPath =
  process.env.JOURNEY_DB_PATH ||
  path.join(os.homedir(), ".journey", defaultDbName);
const filesDir = path.join(path.dirname(dbPath), "attachments");

// The built SPA (vite build output). Served by Express in production so the app
// and API share one origin. Resolved relative to this file, not the cwd.
const distDir = path.join(fileURLToPath(new URL("..", import.meta.url)), "dist");

export const config = {
  env,
  isProd,
  isTest,
  dbPath,
  filesDir,
  distDir,
  indexHtml: path.join(distDir, "index.html"),
  /** Session lifetime + cookie hardening. Secure requires HTTPS; defaults to on
   *  in production. Override with JOURNEY_COOKIE_SECURE=false for a plain-HTTP
   *  tailnet, or =true behind an HTTPS proxy (e.g. `tailscale serve`). */
  sessionMs: 1000 * 60 * 60 * 24 * 30, // 30 days
  cookieSecure:
    process.env.JOURNEY_COOKIE_SECURE !== undefined
      ? process.env.JOURNEY_COOKIE_SECURE === "true"
      : isProd,
  /** Trust an upstream proxy (Tailscale Serve, nginx/Caddy) for req IP/proto. */
  trustProxy: process.env.JOURNEY_TRUST_PROXY === "true" || isProd,
  port: process.env.PORT ? Number(process.env.PORT) : isTest ? 8788 : 8787,
  maxFileBytes: 25 * 1024 * 1024, // 25 MB
  // The test env uses a separate bot token so it never hijacks the real bot.
  telegramToken:
    (isTest
      ? process.env.TELEGRAM_TEST_BOT_TOKEN
      : process.env.TELEGRAM_BOT_TOKEN) ?? null,
  openaiApiKey: process.env.OPENAI_API_KEY ?? null,
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
};
