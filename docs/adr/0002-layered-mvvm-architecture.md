# ADR-0002 — Layered MVVM + pure domain + feature slices

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** solo dev
- **Related:** `docs/ARCHITECTURE.md`, `docs/GLOSSARY.md`

## Context

React is a view library with unidirectional data flow, so classic MVC/MVP fit awkwardly.
We need a structure that keeps the trickiest logic (DAG rules, subgoal propagation, LOD
math) testable without a browser, and keeps the WebGL renderer decoupled from React
re-renders.

## Decision

We will use **unidirectional data flow + a pure domain layer + Zustand stores as
ViewModels + feature-sliced folders** (effectively modern MVVM):

- **Domain layer** (`src/domain/`) — pure TS; imports nothing from React/Pixi/Zustand.
- **State layer** (`src/state/`) — Zustand stores hold state + actions; may use domain.
- **Render layer** (`src/render/`) — an imperative PixiJS adapter that subscribes to
  stores; it owns no state.
- **Feature slices** (`src/features/`) — thin React UI grouped by feature.

## Consequences

- Positive: the domain layer is fast to unit-test; the renderer seam prevents React from
  re-rendering the WebGL scene; features evolve independently.
- Negative: the store↔renderer "binding" is manual (the one place MVVM binding is explicit).
- Follow-up: keep domain imports one-directional; extract renderer math into `domain/`.

## Alternatives considered

- **Classic MVC/MVP** — bidirectional/"passive view" fights JSX and unidirectional flow.
- **A single global store with UI-coupled logic** — would make the core rules untestable
  without React/Pixi.
