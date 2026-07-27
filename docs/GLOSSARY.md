# Journey — Glossary (Ubiquitous Language)

Status: **Living**
Last updated: 2026-07-26

> The shared vocabulary for Journey. Use these exact terms in code, docs, commits, tests,
> and conversation. When a term changes meaning, update it here first.

---

## Core domain

- **Journey** — a single user's graph: nodes, edges, traits, and attachments. A user may
  own several journeys and switch between them.
- **Node** — any vertex on the canvas. Either the **You** node or a **Goal**.
- **You node** (start point) — the single root node at the canvas center for a journey;
  goals ultimately connect back toward it. Carries the user's name and traits.
- **Goal** — a user-created node representing something to achieve. Has name, description,
  color, cover, traits, and incoming subgoals.
- **Trait** — a personal quality, priority, or skill attached to a node. Traits are
  **nestable** (sub-traits) and can carry attachments, a cover, and a done status.
- **Subgoal** — a node that feeds another via a directed edge (source = prerequisite of
  target). "Subgoal" is a *relationship role*, not a separate node type.
- **Edge / Connection** — a one-directional arrow from source to target. The graph is a
  **DAG** (no cycles).

## Canvas & rendering

- **Camera** — the pan/zoom state (position + zoom) used to map world ↔ screen.
- **Viewport** — the canvas pixel dimensions the camera projects into.
- **World space / Screen space** — node positions are stored in world space; the renderer
  projects them to screen space via the camera.
- **Level of detail (LOD)** — a goal's world size is fixed at placement
  (`worldRadius = BASE_NODE_RADIUS / zoomAtPlacement`); rendered size = `worldRadius * zoom`.
  Zoomed out, detailed goals shrink to dots; zoomed in, they grow into editable nodes.
- **Grid snap** — new goals snap to the current fine grid intersection.
- **Hit-test** — mapping a screen point to the node under it (used by clicks and by the
  drag-and-drop bridge). Effective radius has an 8px screen minimum.
- **Canvas bridge** — the seam that lets React (HTML drag-and-drop) hit-test nodes and
  create goals on the Pixi canvas without holding a renderer reference.

## Content

- **Attachment** — a stored file (image/audio/etc.) associated with a trait; duplicated
  independently on Copy.
- **Cover** — the image shown as a node's or trait's visual; may reference an attachment.
- **Inbox** — captured inbound content (Telegram / Instagram / iPhone Photos) awaiting
  attachment to a trait.

## Actions

- **Reassign** — move or copy a trait from one goal onto another (canvas drag-and-drop).
- **Copy vs Move** — Copy duplicates the trait with independent attachment/cover files;
  Move relocates it, removing it from the source.
- **Enrichment** — AI processing: transcription (Whisper) + structuring (GPT) into fields.

## Architecture layers (see ARCHITECTURE.md)

- **Domain layer** (`src/domain/`) — pure TS: graph/DAG rules, geometry/LOD, status, color.
  Imports nothing from React/Pixi/Zustand.
- **State layer / ViewModel** (`src/state/`) — Zustand stores holding state + actions.
- **Render layer** (`src/render/`) — the imperative PixiJS adapter subscribing to stores.
- **Feature slice** (`src/features/`) — React UI grouped by feature (canvas, panel, traits…).

## Process (see ENGINEERING-PROCESS.md)

- **UC-ID / REQ-ID** — stable identifiers for use cases and requirements; referenced in
  test names to form the traceability matrix.
- **ADR** — Architecture Decision Record: one dated decision per file.
- **Spec** — a per-feature document (problem, requirements, design, test plan) the work
  is driven from.
