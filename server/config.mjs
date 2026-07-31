// Centralized configuration (12-factor: everything comes from the environment).
// Import this first so `.env` is loaded before any other module reads env vars.
import path from "node:path";
import os from "node:os";

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

export const config = {
  env,
  isProd,
  isTest,
  dbPath,
  filesDir,
  /** Session lifetime + cookie hardening (Secure only over HTTPS in prod). */
  sessionMs: 1000 * 60 * 60 * 24 * 30, // 30 days
  cookieSecure: isProd,
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
