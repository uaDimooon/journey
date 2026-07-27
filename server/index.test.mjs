// Backend integration tests: real Express app + node:sqlite, driven over HTTP.
// Run with `node --test`. Each file gets its own throwaway DB (temp dir) and the
// tables are cleared between tests, so cases are isolated and parallel-safe.
//
// Covers UC-1 (auth) and UC-2 (journeys), including per-user isolation.

import { test, before, after, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

// Configure a disposable test database BEFORE importing the server module.
const dir = mkdtempSync(join(tmpdir(), "journey-srv-test-"));
process.env.JOURNEY_ENV = "test";
process.env.JOURNEY_DB_PATH = join(dir, "db.sqlite");
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TELEGRAM_TEST_BOT_TOKEN;

const { app, db } = await import("./index.mjs");

const TABLES = [
  "telegram_inbox_media",
  "telegram_inbox",
  "instagram_inbox",
  "telegram_links",
  "telegram_link_codes",
  "telegram_state",
  "attachments",
  "journeys",
  "sessions",
  "users",
];

let base;
let server;

before(async () => {
  server = app.listen(0);
  await once(server, "listening");
  base = `http://localhost:${server.address().port}`;
});

after(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  for (const t of TABLES) {
    try {
      db.exec(`DELETE FROM ${t};`);
    } catch {
      /* table may not exist in this build */
    }
  }
});

/** Minimal fetch helper that carries a session cookie and parses JSON. */
async function req(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  const sid = res.headers.getSetCookie?.().find((c) => c.startsWith("sid="));
  return { status: res.status, json, cookie: sid ? sid.split(";")[0] : null };
}

async function signup(email, password = "password123") {
  const r = await req("/api/auth/signup", {
    method: "POST",
    body: { email, password },
  });
  return r;
}

describe("auth (UC-1)", () => {
  test("REQ-1.1: signup creates a user and sets a session cookie", async () => {
    const r = await signup("a@b.com");
    assert.equal(r.status, 200);
    assert.equal(r.json.user.email, "a@b.com");
    assert.ok(r.cookie, "expected a session cookie");
  });

  test("signup rejects an invalid email", async () => {
    const r = await signup("not-an-email");
    assert.equal(r.status, 400);
  });

  test("signup rejects a short password", async () => {
    const r = await req("/api/auth/signup", {
      method: "POST",
      body: { email: "a@b.com", password: "short" },
    });
    assert.equal(r.status, 400);
  });

  test("signup rejects a duplicate email", async () => {
    await signup("dup@b.com");
    const r = await signup("dup@b.com");
    assert.equal(r.status, 409);
  });

  test("REQ-1.2: login succeeds with correct credentials, 401 otherwise", async () => {
    await signup("login@b.com", "password123");
    const ok = await req("/api/auth/login", {
      method: "POST",
      body: { email: "login@b.com", password: "password123" },
    });
    assert.equal(ok.status, 200);
    assert.ok(ok.cookie);

    const bad = await req("/api/auth/login", {
      method: "POST",
      body: { email: "login@b.com", password: "wrong" },
    });
    assert.equal(bad.status, 401);
  });

  test("REQ-1.3: protected routes reject unauthenticated requests", async () => {
    const r = await req("/api/journeys");
    assert.equal(r.status, 401);
  });
});

describe("journeys (UC-2)", () => {
  const graph = { nodes: {}, edges: {} };

  test("REQ-2.1/2.2: create -> list -> get round-trip", async () => {
    const { cookie } = await signup("owner@b.com");

    const created = await req("/api/journeys", {
      method: "POST",
      cookie,
      body: { name: "Life", graph },
    });
    assert.equal(created.status, 200);
    const id = created.json.journey.id;

    const list = await req("/api/journeys", { cookie });
    assert.equal(list.json.journeys.length, 1);
    assert.equal(list.json.journeys[0].name, "Life");

    const got = await req(`/api/journeys/${id}`, { cookie });
    assert.equal(got.status, 200);
    assert.deepEqual(got.json.graph, graph);
  });

  test("REQ-2.2: journeys are isolated per user", async () => {
    const a = await signup("usera@b.com");
    const created = await req("/api/journeys", {
      method: "POST",
      cookie: a.cookie,
      body: { name: "A's journey", graph },
    });
    const id = created.json.journey.id;

    const b = await signup("userb@b.com");
    const list = await req("/api/journeys", { cookie: b.cookie });
    assert.equal(list.json.journeys.length, 0);

    const got = await req(`/api/journeys/${id}`, { cookie: b.cookie });
    assert.equal(got.status, 404);
  });
});
