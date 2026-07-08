# Journey

A web app for visualizing goals, priorities, and traits on an infinite, zoomable
grid canvas — a purposeful, directional mind map of who you want to become.

## Docs

- [docs/VISION.md](docs/VISION.md) — product vision and MVP scope
- [docs/STACK.md](docs/STACK.md) — technology decisions
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — app architecture

## Stack

React + Vite + TypeScript, **PixiJS** (WebGL canvas), **Zustand** (state),
Tailwind CSS. Backend: **Express + SQLite** (`node:sqlite`) with email/password
auth (scrypt hashing, httpOnly session cookies). Graph is stored **per user** on
the server.

## Getting started

Run the API and the web app in two terminals:

```bash
npm install
npm run server   # backend API on http://localhost:8787
npm run dev      # web app on http://localhost:5173 (proxies /api to the server)
```

Other scripts:

```bash
npm run build    # type-check + production build
npm run preview  # preview the production build
npm run lint     # oxlint
```

On first run, create an account (sign up), then your goals are saved to your
account and restored on any browser after logging in. The SQLite database lives
at `server/journey.db` (gitignored).

## How it works (MVP)

- You start at the **center** ("You" node).
- **Click an empty grid intersection** to create a goal (random color by default).
- **Click a node** to select it and edit its name, description, color, and traits
  in the left panel.
- **Link this → another goal**: click the button, then click a target node to draw
  a one-directional arrow. The source becomes a **subgoal** of the target.
- **Pan** by dragging, **zoom** with the scroll wheel. Zoomed out, goals shrink to
  dots; zoomed in, they reveal labels.
- The graph is saved to your **account** automatically (debounced), and restored
  when you log in again.

## Project structure

```
src/
  api/       # backend client (fetch wrapper)
  domain/    # pure logic: types, graph rules (DAG), geometry, color
  state/     # Zustand stores (ViewModels): graph, camera, selection, auth
  render/    # PixiJS renderer (imperative adapter, subscribes to stores)
  features/  # feature slices: app (sync), auth, canvas, panel, traits
  App.tsx    # app shell (auth gating)
server/
  index.mjs  # Express + SQLite API (auth + per-user graph storage)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the rationale.