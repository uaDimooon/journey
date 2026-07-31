# ADR-0005 — Portable data layer (config / storage / db seams)

- **Status:** Accepted
- **Date:** 2026-07-30
- **Deciders:** solo dev
- **Related:** ADR-0003; deployment path (home+Tailscale → public web/mobile)

## Context

The plan is to run Journey personally first (home machine + Tailscale) and later as
a public web/mobile service. ADR-0003 chose `node:sqlite` + local-filesystem
attachments — great for personal use, but a public service eventually needs a hosted
DB (Turso/libSQL or Postgres) and object storage (S3/R2). The risk was data access
being scattered across `server/index.mjs`, making that migration a large, risky rewrite.

## Decision

We will keep all environment, database, and file access behind dedicated seams so the
backends are swappable without touching the routes:

- **`server/config.mjs`** — all configuration from the environment (12-factor):
  paths, flags, session/cookie settings, port, secrets.
- **`server/storage.mjs`** — a file-storage interface (`write/exists/copy/remove/
  createReadStream`). Local FS today; the single place to drop in S3/R2.
- **`server/db.mjs`** — `openDatabase()` owns the connection, schema, migrations, and
  the legacy fold. The place to adapt when moving off local `node:sqlite`.

Routes in `index.mjs` consume these; the API keeps its behavior. The Telegram/AI
workers still receive `db` + `filesDir` directly (a documented follow-up).

## Consequences

- Positive: personal→public becomes a contained migration (swap `storage` and/or
  `db`), not a rewrite. SPA, domain, API, and tests are backend-agnostic.
- Positive: cookie hardening (`Secure` in prod) and config are centralized.
- Trade-off: a thin indirection layer; and the SQL is still inline in routes — a
  per-entity repository extraction is the next step (cheap once these seams exist,
  and cheaper still toward SQLite-compatible Turso).
- Follow-up: route the Telegram worker's file writes through `storage`; extract
  per-entity repositories; add backups (Litestream) at deploy time.

## Alternatives considered

- **Leave data access inline** — simplest now, but makes the public migration a risky
  big-bang rewrite.
- **Full repository layer + ORM immediately** — more up-front churn than warranted;
  staged extraction behind these seams is lower-risk.
