# Journey — Architecture

Status: **Decided (MVP)**
Last updated: 2026-07-07

---

## Decision

Do **not** adopt MVC / MVP / MVVM as a dogma. Instead adopt:

> **Unidirectional data flow + a pure domain layer + Zustand ViewModels + feature-sliced folders.**

This is effectively modern MVVM and reflects the current mainstream React trend.

---

## Why not classic MVC/MVP/MVVM?

MVC, MVP, and MVVM come from OO desktop/mobile worlds. React is a *view* library with
**unidirectional data flow**, so those patterns fit only awkwardly.

| Pattern | Core idea | React equivalent | Reality |
|---|---|---|---|
| MVC | Controller mediates Model ↔ View | store + components + event handlers | Fits awkwardly; not MVC's bidirectional loop |
| MVP | Presenter holds view logic, passive view | container/presentational + hooks | Closer, but "passive view" fights JSX |
| MVVM | ViewModel exposes bindable state | **hooks/stores are ViewModels; JSX binds** | **Natural fit** |

MVVM is the closest match: a Zustand store (or custom hook) *is* a ViewModel, and
components bind to it reactively.

---

## Modern approach (what we use)

1. **Unidirectional data flow** — state flows down, events flow up.
2. **Feature-sliced / modular structure** — organize by feature (canvas, panel, traits),
   not by technical layer.
3. **Layered separation of concerns:**
   - **State layer** (stores / ViewModels) — Zustand
   - **Domain layer** (pure logic: graph rules, LOD math, DAG validation) — plain TS,
     framework-free and unit-testable
   - **View layer** (React components + Pixi renderer) — reads state
4. **Hooks as composition primitive** — `useCanvasCamera`, `useGraph`, `useSelection`.
5. **Rendering (Pixi) decoupled** behind an imperative adapter that subscribes to the
   store — React never re-renders the WebGL scene directly.

---

## Target folder structure

```
src/
  domain/          # pure, testable, no React/Pixi
    graph.ts       # nodes, edges, DAG rules, subgoal logic
    geometry.ts    # grid snap, LOD sizing (size = base / zoom)
  state/           # Zustand stores = ViewModels
    graphStore.ts
    cameraStore.ts
    selectionStore.ts
  render/          # PixiJS adapter (imperative, subscribes to stores)
    CanvasRenderer.ts
    layers/        # grid, nodes, edges
  features/
    canvas/        # React wrapper mounting the Pixi canvas
    panel/         # left detail panel (binds to selection + graph store)
    traits/
  app/             # App shell, layout, providers
```

### Why this fits Journey specifically
- **Pure domain layer** — DAG/cycle rules, subgoal propagation, and LOD math are the
  trickiest logic and must be unit-testable without a browser.
- **Imperative Pixi renderer** — a React-managed WebGL tree would kill performance, so an
  adapter subscribing to Zustand is the correct seam. This is the one place the MVVM
  "binding" is manual.
- **Feature slices** keep canvas, panel, and traits independently evolvable.

---

## Rules of thumb

- Domain layer imports **nothing** from React, Pixi, or Zustand.
- Stores hold state + actions; they may import domain logic.
- The Pixi renderer reads from stores via subscriptions; it does not own state.
- React components are thin: read from stores, dispatch actions, render UI.
