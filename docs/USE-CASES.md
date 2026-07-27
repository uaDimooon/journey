# Journey — Use Cases & Requirements

Status: **Living** (reflects current product, not just MVP vision)
Last updated: 2026-07-26

> The traceability root. Every use case has a stable **UC-ID**; every acceptance
> criterion has a **REQ-ID**. Reference these IDs in test names/tags so the test suite
> doubles as the traceability matrix. IDs are **append-only** — never renumber.
>
> Source of intent: [VISION.md](VISION.md). This document tracks what the product
> *actually does today*, which has grown beyond the original MVP scope.

---

## Actors

- **User** — the person mapping their goals/traits.
- **AI service** — OpenAI (Whisper transcription + GPT structuring) for enrichment.
- **Ingestion bots** — Telegram / Instagram inbound content.

---

## A. Account & Journeys

### UC-1 — Sign up / sign in
- **REQ-1.1** A user can register with email + password.
- **REQ-1.2** A user can log in and stays authenticated across reloads (session cookie).
- **REQ-1.3** A user can log out; protected data is no longer accessible.

### UC-2 — Manage journeys
- **REQ-2.1** A user can create, rename, and switch between multiple journeys.
- **REQ-2.2** Each journey has its own graph (nodes, edges, traits, attachments).
- **REQ-2.3** The selected journey persists and reloads on next visit.

---

## B. Canvas

### UC-3 — Navigate the canvas
- **REQ-3.1** The canvas is an infinite, pannable, zoomable grid.
- **REQ-3.2** The grid subdivides (fine + coarse) as the user zooms in and merges out.
- **REQ-3.3** Every user starts with a single **"You"** node at the center.

### UC-4 — Create a goal
- **REQ-4.1** Double-clicking an empty grid intersection creates a goal snapped to it.
- **REQ-4.2** A goal's world size is fixed at placement (`BASE_NODE_RADIUS / zoom`), so
  goals placed while zoomed in are physically smaller (level-of-detail).
- **REQ-4.3** A new goal is auto-selected and opens in the left panel.

### UC-5 — Select & inspect a node
- **REQ-5.1** Clicking a node selects it and hit-testing is accurate at its rendered radius.
- **REQ-5.2** The left panel shows the selected node's name, description, color, traits,
  cover, and incoming subgoals.
- **REQ-5.3** An "Overview" list appears when nothing is selected and can focus/center a node.

### UC-6 — Link goals (subgoal → goal)
- **REQ-6.1** A user can draw a one-directional arrow from a source node to a target.
- **REQ-6.2** The edge is directional (source is a subgoal/prerequisite of target).
- **REQ-6.3** Creating an edge must not introduce a cycle (DAG invariant).
- **REQ-6.4** The target node's panel lists its incoming subgoals.

---

## C. Editing a node

### UC-7 — Edit goal properties
- **REQ-7.1** A user can edit name and description; edits update the canvas live.
- **REQ-7.2** A user can set color via picker; a random color is assigned by default.
- **REQ-7.3** A user can set/replace/remove a goal **cover image**; renaming must not
  disturb the cover.

### UC-8 — Manage traits (nested)
- **REQ-8.1** A user can add, rename, remove, and reorder traits on a node.
- **REQ-8.2** Traits can be nested (sub-traits) to arbitrary depth.
- **REQ-8.3** A user can mark a trait done (status toggle).
- **REQ-8.4** Traits can be reordered / nested / moved to top level via tree drag-and-drop.
- **REQ-8.5** A trait can carry attachments and a cover image.

---

## D. Trait drag-and-drop (canvas)

### UC-9 — Reassign a trait onto another goal
- **REQ-9.1** Dragging a trait from the panel onto an existing goal prompts **Copy or Move**.
- **REQ-9.2** **Move** removes the trait from the source and adds it to the target.
- **REQ-9.3** **Copy** duplicates the trait with independent attachment/cover files.
- **REQ-9.4** Dropping a trait back on its own source goal is a no-op.

### UC-10 — Create a new goal by dropping a trait on empty canvas
- **REQ-10.1** Dropping a trait on empty canvas prompts **Copy or Move** "into a new goal".
- **REQ-10.2** On confirm, a new goal is created at the drop position holding the trait.
- **REQ-10.3** Cancel creates nothing and leaves the source unchanged.

---

## E. Enrichment & ingestion

### UC-11 — AI enrichment
- **REQ-11.1** A user can enrich content via AI: audio is transcribed (Whisper).
- **REQ-11.2** Freeform content is structured into goal/trait fields (GPT), returned as JSON.
- **REQ-11.3** AI failures degrade gracefully without corrupting the graph.

### UC-12 — Inbox ingestion (Telegram / Instagram / iPhone Photos)
- **REQ-12.1** Inbound media/links are captured into an inbox for the linked user.
- **REQ-12.2** A user can attach an inbox item to an existing trait.
- **REQ-12.3** Ingestion is isolated per user (link codes / account binding).

---

## F. Import / export

### UC-13 — Lossless journey export & import
- **REQ-13.1** A user can export a journey to a self-contained file (attachment bytes bundled).
- **REQ-13.2** Importing restores the graph losslessly and remaps IDs to avoid collisions.

### UC-14 — Export goal(s) as image / PDF
- **REQ-14.1** A user can export a goal (root + subgoals) with nested traits, full
  descriptions, and images to PNG/PDF.
- **REQ-14.2** Export is dependency-free (in-house canvas→PDF).

---

## Traceability convention

- Test names/tags reference IDs: `test('UC-10/REQ-10.2: new goal created at drop position')`.
- A requirement is "covered" when at least one test references its REQ-ID.
- IDs are append-only; deprecate with a note rather than reusing a number.
