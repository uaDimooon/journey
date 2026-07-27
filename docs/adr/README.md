# Architecture Decision Records (ADRs)

An **ADR** captures one significant decision, the context behind it, and its
consequences. One decision per file. ADRs are **immutable once accepted** — to change a
decision, add a new ADR that supersedes the old one (and update the old one's status).

## Format

We use the Michael Nygard format: **Title · Status · Context · Decision · Consequences**.

- **Status:** Proposed → Accepted → (later) Superseded by ADR-NNNN / Deprecated.
- **Numbering:** zero-padded, append-only (`0001`, `0002`, …). Never reuse a number.
- **Template:** [0000-template.md](0000-template.md).

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-webgl-pixijs-rendering.md) | WebGL (PixiJS) for the canvas | Accepted |
| [0002](0002-layered-mvvm-architecture.md) | Layered MVVM + pure domain + feature slices | Accepted |
| [0003](0003-backend-express-node-sqlite.md) | Backend: Express + `node:sqlite` | Accepted |
| [0004](0004-testing-tooling.md) | Testing tooling (Vitest + RTL/MSW + Playwright + node:test) | Proposed |

> These ADRs formalize decisions previously embedded in `docs/STACK.md`,
> `docs/ARCHITECTURE.md`, and `docs/TESTING.md`.
