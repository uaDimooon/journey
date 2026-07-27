# ADR-0003 — Backend: Express + `node:sqlite`

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** solo dev
- **Related:** UC-1, UC-2, UC-12, UC-13; `docs/STACK.md`

## Context

The MVP started with localStorage, but accounts, per-user graphs, attachments, and
ingestion (Telegram/Instagram) require a server. We want minimal operational overhead
and few dependencies, on a modern Node runtime.

## Decision

We will run a **Node + Express** API using the built-in **`node:sqlite`** (`DatabaseSync`)
for storage — no ORM. Auth is email/password with scrypt hashing and httpOnly session
cookies. Config is read via `process.loadEnvFile()`. A dedicated `JOURNEY_ENV=test`
database isolates automated tests from real data.

## Consequences

- Positive: near-zero dependencies; SQLite is a single file, easy to back up; the graph
  is just nodes + edges JSON, so persistence is cheap; test isolation is built in.
- Negative: hand-written SQL; the server is untyped `.mjs`, creating a client/server
  contract gap (mitigate with runtime validation / contract tests — see ADR-0004).
- Follow-up: store the DB outside the repo tree so `git clean`/`rm -rf` can't wipe it;
  use an in-memory SQLite per test for parallel-safe backend tests.

## Alternatives considered

- **Supabase (Postgres + auth)** — less code, but adds a hosted dependency and less control.
- **Postgres + an ORM (Prisma/Drizzle)** — heavier than the data model warrants at this stage.
