# ADR-0001 — WebGL (PixiJS) for the canvas

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** solo dev
- **Related:** UC-3, UC-4, REQ-4.2, REQ-3.2; `docs/STACK.md`

## Context

Journey's core requirement is a level-of-detail (LOD) infinite canvas: goals placed
while zoomed in are physically smaller and collapse into dots when zoomed out
(`worldRadius = BASE_NODE_RADIUS / zoomAtPlacement`, `screenRadius = worldRadius * zoom`).
The renderer must handle an adaptive grid, thousands of nodes-as-dots, directional
arrows, and GPU-smooth pan/zoom. Rendering is the single high-cost decision; it is
isolated behind the state layer.

## Decision

We will render the canvas with **PixiJS (WebGL)** and hand-roll the camera, grid,
node/edge drawing, and hit-testing.

## Consequences

- Positive: full control over LOD sizing and the grid; scales to 10k+ nodes at 60 fps;
  the sizing model maps exactly to the vision.
- Negative: more custom code — hit-testing, arrows, and text are ours to build and test.
- Follow-up: the renderer is an imperative adapter (see ADR-0002); its pure math
  (hit-test, world/screen transforms) should live in `domain/` for testability.

## Alternatives considered

- **SVG / HTML DOM** — easy and accessible, but degrades past a few hundred nodes.
- **Canvas 2D** — good control, but no GPU headroom for the dot-at-zoom vision at scale.
- **Graph libraries (React Flow, etc.)** — fastest to a demo, but opinionated and hard
  to bend to grid-snap + zoom-scaled sizing.
