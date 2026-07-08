# Journey — Stack Analysis

Status: **Decided (MVP)**
Last updated: 2026-07-07

---

## Decision

**Chosen: Option B — WebGL rendering for the long-term zoom vision.**

Rationale: the core requirement "smaller/nested goals shrink to dots when zoomed out
and reveal detail when zoomed in" is level-of-detail (LOD) rendering. WebGL (PixiJS)
gives full control over the grid, LOD dots, `size = base / zoom` math, and scales to
thousands of nodes without hitting a ceiling.

---

## The critical piece: rendering an infinite zoomable graph

Everything hinges on the canvas/rendering layer: infinite pan/zoom, grid, thousands of
nodes-as-dots, and directional arrows.

| Approach | Pros | Cons | Fit |
|---|---|---|---|
| SVG / HTML DOM | Easy, accessible, crisp text, simple events | Degrades past a few hundred nodes; manual zoom/pan | Only if graph stays small |
| Canvas 2D | Fast, full control, cheap dots/grid | Build hit-testing, text, arrows yourself | Good middle ground |
| WebGL (PixiJS) | 10k+ nodes at 60fps, GPU zoom | More setup, text trickier | **Best for the dot-at-zoom vision** |
| Graph libs (React Flow, etc.) | Nodes/edges/zoom out of the box | Opinionated; harder to bend to grid-snap + zoom-scaled sizing | Fastest to first demo |

The "smaller goals shrink to dots when zoomed out" requirement is essentially
level-of-detail rendering, which favors Canvas or WebGL over a DOM-based library.

---

## Options considered

### Option A — Fastest MVP
- React + Vite + TypeScript
- React Flow (`@xyflow/react`) — infinite pan/zoom, grid, nodes, directional edges, selection for free
- Zustand for state, Tailwind for the left panel
- localStorage persistence (JSON graph)
- Trade-off: fight React Flow on custom zoom-scaled sizing; but a clickable prototype fast.

### Option B — Best long-term fit (CHOSEN)
- React + Vite + TypeScript
- **PixiJS (WebGL)** for the canvas — full control over grid, LOD dot rendering, `size = base / zoom`; scales to thousands of nodes
- Zustand for state, React for the left panel overlay
- localStorage → later a backend
- Trade-off: more custom code (hit-testing, arrows, text), but matches the sizing model exactly and won't hit a ceiling.

### Option C — Lean, minimal-dependency
- React + Vite + TypeScript + raw Canvas 2D
- Hand-rolled camera (pan/zoom), grid, node/edge drawing
- Zustand + localStorage
- Trade-off: most educational and flexible; more work than A, less GPU headroom than B.

---

## Chosen stack detail

| Layer | Choice |
|---|---|
| Language | TypeScript |
| Build tool | Vite |
| UI framework | React |
| Canvas / rendering | PixiJS (WebGL) |
| State management | Zustand |
| Styling (panels/UI) | Tailwind CSS |
| Persistence (MVP) | localStorage (nodes + edges JSON) |
| Persistence (later) | Supabase, or Node/Express + SQLite/Postgres |

Common foundation (React + Vite + TS + Zustand) is shared across all options, so the
rendering choice is the only high-cost decision — and it's isolated behind state.

---

## Persistence path

localStorage now → when accounts/sync are needed, add a thin backend:
- **Supabase** (Postgres + auth, minimal ops), or
- small **Node/Express + SQLite/Postgres** API.

The graph is just nodes + edges JSON, so this migration is cheap.
