# Journey — Testing Strategy

Status: **Proposed** (not yet implemented)
Last updated: 2026-07-26

---

## Decision

Adopt a **layered, per-seam testing strategy** that mirrors the architecture:

> **Pyramid the pure core (`domain` / `state` / `lib`) with Vitest, Trophy the
> features with React Testing Library + MSW, keep the backend dependency-free with
> `node:test` + in-memory SQLite, and make the canvas testable by _extracting its
> math_ and giving E2E a _deterministic bridge_ instead of guessing pixels.**

The test shape is chosen **per layer**, not as one global ratio.

---

## Guiding principles (modern / FAANG)

1. **Test behavior through public seams, not implementation.** Assert store actions,
   rendered UX, and API contracts — never internals. This survives refactors.
2. **The right test shape is per-layer.** Pure logic → many cheap unit tests
   (Pyramid). UI/features → integration-heavy (Kent C. Dodds' **Testing Trophy**).
   This hybrid is deliberate, not dogmatic "70/20/10".
3. **Confidence per second is the metric.** Fast + deterministic + parallel + isolated.
   A flaky test is worse than no test.
4. **Mock only true externals** (OpenAI, Telegram, the network). Use the real DB
   (in-memory), real stores, and real domain code everywhere else.
5. **Coverage is a diagnostic, not a target** (Goodhart's law). Ratchet "don't
   decrease"; gate the high-value layers; do **not** mandate a blanket 100%.

---

## How this maps to the codebase

The architecture already provides clean test seams: `domain/` is pure TS, `state/`
are Zustand ViewModels, `render/` is an imperative Pixi adapter, and `server/` has a
dedicated `JOURNEY_ENV=test` database.

| Layer | What to test | Test kind | Why it's the right seam |
|---|---|---|---|
| `domain/` | DAG/cycle rules, LOD sizing, grid snap, status propagation, color | **Unit** (pyramid) | Pure, zero deps — highest ROI, milliseconds to run |
| `state/` | Store actions (`addGoal`, `moveTrait`, copy/move) headless | **Unit / Integration** | ViewModels are the real app logic; call actions, assert state |
| `lib/` | `journeyFile` export→import round-trip, `linkify` | **Unit** | Lossless serialization is exactly where regressions hide |
| `api/` | Client request/response shaping | **Integration + MSW** | Runs the real client code against a mocked network |
| `features/` | Panel/trait editing, forms, copy/move dialog flow | **Integration** (Trophy) | Highest confidence per test for UI |
| `render/` | Extract pure hit-test/transform math → unit; interaction → E2E | **Unit + E2E** | Don't unit-test WebGL; test the math and the real thing |
| `server/` | Auth, journeys CRUD, attachments against `:memory:` DB | **Integration** | Real SQL, isolated per test, parallel-safe |

### Test-shape diagram

```
        ╱────────────────────────╲   E2E — Playwright (real browser + WebGL)
       ╱  few, high-value journeys ╲   auth, create goal, drag trait→goal/→new goal, export
      ╱────────────────────────────╲
     ╱  Integration — Vitest (bulk)  ╲  features via RTL/Browser Mode, api↔MSW, server↔:memory:
    ╱────────────────────────────────╲
   ╱   Unit — Vitest (many, cheap)     ╲ domain/*, lib/*, state/* actions
  ╱────────────────────────────────────╲
 ╱   Static — tsc --noEmit + oxlint      ╲ first line of defense
╱────────────────────────────────────────╲
```

---

## Tooling — decisions and reasoning

### Test runner → **Vitest**

| Option | Pros | Cons |
|---|---|---|
| **Vitest** ✅ | Reuses `vite.config.ts` + the same transform pipeline (zero config drift), ESM/TS-native, Jest-compatible API, fastest watch, v8 coverage, in-source & type testing | Younger ecosystem than Jest (a non-issue now) |
| Jest | Mature, huge ecosystem | ESM/TS friction, a separate transform config that diverges from Vite, slower |
| `node:test` | Zero-dep, built into Node 26 | Weak jsdom/component story, sparse mocking for the frontend |

**Reasoning:** On Vite 8, Vitest shares the exact build graph, so a component renders in
tests the same way it renders in the app — eliminating a whole class of
"works in app, breaks in the test runner" config bugs. Highest-leverage choice.

### Component testing → **RTL + jsdom** (default), **Vitest Browser Mode** for canvas-adjacent UI

| Option | Pros | Cons |
|---|---|---|
| **RTL + jsdom / happy-dom** ✅ (default) | Fast, standard, tests user-visible behavior | jsdom fakes layout/DnD — poor for canvas/drag |
| **Vitest Browser Mode** (Playwright provider) ✅ (for DnD/canvas UI) | Real browser: real layout, real pointer/drag events, real WebGL | Slower; newer |
| Enzyme | — | Dead; tests internals. Avoid. |

**Reasoning:** RTL covers ~90% (forms, panel, dialogs) cheaply. The DnD/canvas UI is
exactly where jsdom lies to you; Browser Mode runs those specific tests in real
Chromium with genuine drag events.

### E2E → **Playwright**

| Option | Pros | Cons |
|---|---|---|
| **Playwright** ✅ | Auto-wait, multi-browser, trace viewer, fast parallel sharding, real WebGL; already in use | Slight learning curve |
| Cypress | Nice DX | Weaker multi-origin/tab, slower parallelism |

**Reasoning:** Already the de-facto tool and the current standard. The win is
**codifying** ad-hoc flows into a committed `e2e/` suite with a **deterministic test
bridge** (below) so we never coordinate-scan the canvas again.

### Backend → **`node:test` + in-memory SQLite** (alt: Vitest + supertest)

| Option | Pros | Cons |
|---|---|---|
| **`node:test` + `new DatabaseSync(':memory:')`** ✅ | Zero new deps (matches the node:sqlite / no-ORM ethos), a fresh isolated DB per test → parallel-safe, fast | Two runners (Vitest for FE, node:test for BE) |
| Vitest + supertest | One unified runner/report | Adds deps; heavier around a native-sqlite Express app |

**Reasoning:** The backend's whole philosophy is "lean, built-in, no dependencies."
An in-memory SQLite per test gives perfect isolation and removes the manual
"wipe tables between runs" ritual. The two-runner split is a deliberate trade —
each half uses the tool that matches its dependency philosophy.

### Network mocking → **MSW (Mock Service Worker)**

Intercepts at the network layer, so the **real** `api/client` code runs against
realistic responses — superior to stubbing `fetch` (which bypasses the code under
test). Reuse the same handlers in Vitest and Browser Mode.

---

## The hard part: testing the Pixi / WebGL canvas

Don't fight WebGL in unit tests. Three-pronged instead:

1. **Extract pure math into `domain/`.** The hit-test in `render/CanvasRenderer.ts`
   is really a pure function `nodeAtPoint(nodes, cam, viewport, point)`. Move it to
   `domain/geometry.ts` and unit-test exhaustively (radius edges, zoom, overlap).
   This alone catches "small-radius miss" bugs in a 1 ms test.
2. **A deterministic test bridge for E2E.** In test builds only, expose
   `window.__journeyTest = { screenPosOf(nodeId), nodeIdAt(x, y) }`. E2E then drops
   **on a node's real coordinates** instead of scanning a grid — eliminating the
   flakiness we hit with synthetic drag-and-drop.
3. **Avoid WebGL pixel-diffing.** Screenshot diffs across GPUs are flaky. Prefer
   semantic assertions ("a new goal exists at the drop world-position", "trait moved
   off the source"). Reserve visual snapshots for stable DOM (the panel), not the canvas.

---

## Cross-cutting foundations

- **Determinism seams.** Make `makeId` (in `domain/graph.ts`, currently
  `Date.now()` + a module counter) and "now" injectable, or add a test reset hook.
  Fine for uniqueness today; bad for stable assertions. Small refactor, big payoff.
- **Test data builders (factories).** `makeNode()`, `makeGraph()`, `makeTrait()`
  with overrides in `test/factories/`. No shared mutable fixtures (a classic
  flakiness source).
- **CI pipeline (GitHub Actions), required before merge:**
  `oxlint` → `tsc -b --noEmit` → `vitest run --coverage` → `node --test server` →
  `vite build` → `playwright test` (sharded). Cache deps + Playwright browsers.
  Matches the existing PR-per-feature flow.
- **Coverage policy.** Gate `domain/` + `state/` + `lib/` (the logic that matters);
  ratchet "no decrease" globally; no blanket 100% mandate.

---

## Phased rollout (incremental, low-risk)

1. **Foundation** — add Vitest + config, `test/factories`, wire `oxlint` + `tsc`
   into a CI workflow. First tests: `domain/geometry` + `domain/graph` (DAG).
2. **Logic core** — cover `state/graphStore` (copy/move/reassign), `lib/journeyFile`
   round-trip, `lib/linkify`. Add the `makeId` / clock seam.
3. **Extract + test canvas math** — move `nodeAtPoint` to `domain/`, unit-test it,
   refactor the renderer to use it.
4. **Integration** — MSW + `api/client`; RTL for panel/traits/dialogs; `node:test`
   + `:memory:` for server auth/journeys/attachments.
5. **E2E** — add the test bridge; codify the golden journeys (auth, create goal,
   drag trait→goal, drag trait→new goal, export/import) in a committed Playwright
   suite; make it a required check.

---

## Final selection at a glance

| Concern | Choice | Runner-up |
|---|---|---|
| Test runner | **Vitest** | `node:test` |
| Component (default) | **RTL + jsdom** | — |
| Component (canvas/DnD) | **Vitest Browser Mode** | Playwright component tests |
| E2E | **Playwright + test bridge** | Cypress |
| Backend | **`node:test` + in-memory SQLite** | Vitest + supertest |
| Network mocking | **MSW** | manual `fetch` stubs |
| Canvas | **Extract pure math + semantic E2E** | WebGL screenshot diff (rejected) |
| CI | **GitHub Actions, required checks** | — |
