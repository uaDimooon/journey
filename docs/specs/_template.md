# Spec NNNN — <feature title>

- **Status:** Draft <!-- Draft | Approved | In progress | Done -->
- **Date:** YYYY-MM-DD
- **Related:** <UC-/REQ- ids, ADRs, Figma frames, PRs>

## 1. Problem / motivation

What user problem or gap does this address? Who is it for? Why now?

## 2. Requirements & acceptance criteria

Reuse or add ids in `docs/USE-CASES.md`. State each as a testable criterion.

- **REQ-x.y** — …
- **REQ-x.z** — …

## 3. UX / design

Link the Figma frame(s) or describe the interaction. Note any new design tokens.

## 4. Design / approach

How it fits the architecture (which layers: domain / state / render / features / server).
Data shape changes, new store actions, new seams. Note anything that touches the DAG
invariant, LOD sizing, or the canvas bridge.

## 5. Alternatives considered

Briefly, the options not taken and why.

## 6. Test plan

Map each REQ to at least one test, at the right layer (unit / integration / E2E), tagged
with its id — e.g. `UC-x/REQ-y: <behavior>`.

- REQ-x.y → <unit|integration|e2e> test: …

## 7. Rollout / risks

Migration, feature-flagging, data risk, and how to verify on the test stack (`:5174`/`:8788`).

## 8. Out of scope

What this explicitly does not do.
