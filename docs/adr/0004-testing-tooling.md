# ADR-0004 — Testing tooling

- **Status:** Proposed
- **Date:** 2026-07-26
- **Deciders:** solo dev
- **Related:** `docs/TESTING.md` (full strategy), all UC/REQ ids

## Context

The project has no automated tests yet; testing has been ad-hoc, agent-driven Playwright.
We want a modern, low-friction toolchain that matches the layered architecture and the
existing Vite/Node/`node:sqlite` stack, and that lets tests trace to UC/REQ ids.

## Decision

We will adopt a **per-seam toolchain**:

- **Vitest** as the unit/integration runner (shares `vite.config.ts`).
- **React Testing Library + jsdom** for components; **Vitest Browser Mode** for
  canvas/drag-and-drop UI that jsdom can't model.
- **Playwright** for E2E, with a deterministic test bridge instead of coordinate-scanning.
- **`node:test` + in-memory SQLite** for backend tests (dependency-free, parallel-safe).
- **MSW** for network mocking so real `api/client` code runs under test.
- Canvas: extract pure hit-test/transform math into `domain/` and unit-test it; use
  semantic E2E assertions, not WebGL pixel-diffing.

Full rationale, comparisons, and rollout phases live in `docs/TESTING.md`.

## Consequences

- Positive: fast, deterministic, parallel tests aligned to the architecture seams; the
  test suite doubles as living documentation via UC/REQ ids.
- Negative: two runners (Vitest for FE, `node:test` for BE) — a deliberate trade to keep
  the backend dependency-free.
- Follow-up: add injectable id/clock seams (`makeId`) for deterministic assertions; add a
  CI pipeline (oxlint → tsc → vitest → node:test → build → Playwright).

## Alternatives considered

- **Jest** — ESM/TS friction and a transform config that diverges from Vite.
- **One unified runner (Vitest + supertest) for the backend** — adds deps and is heavier
  around a native-sqlite Express app.
- **Cypress** for E2E — weaker multi-origin/parallelism than Playwright.
