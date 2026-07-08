# Journey — Vision

> A web app for visualizing a person's goals, priorities, and traits on an infinite,
> zoomable canvas — a purposeful, directional mind map of who you want to become.

Status: **Draft / MVP planning**
Last updated: 2026-07-07

---

## 1. Concept

Journey helps a user map out their **goals** and the **traits** that support them.
The experience centers on an **infinite, zoomable, grid-based canvas** where the user
starts from a single point ("You") and grows a directed graph of goals outward.

Think of it as a mind map, but:
- Connections are **one-directional** (they express dependency / progression).
- Nodes carry **structured meaning** (traits, descriptions, subgoals).
- The **zoom level encodes hierarchy** — big goals stay readable when zoomed out,
  small/detailed goals shrink into dots until you zoom in.

---

## 2. Core Objects

### 2.1 Start Point (the "You" node)
- Every user begins with one starting node at the **center** of the canvas.
- When clicked, the left panel shows:
  - The user's **name**.
  - A **list of assigned traits**.
- It is the root that goals eventually connect back toward.

### 2.2 Goal
- Created by tapping an **empty grid intersection**.
- Properties:
  - **Name**
  - **Description**
  - **Color** — user-selectable; a **random color** is assigned by default.
  - **Traits** attached to it.
  - **Subgoals** (goals connected into it).
- Rendered as a fixed-visual-size marker (see Zoom rules below).

### 2.3 Trait
- A tag/attribute that can be assigned to the start point and/or goals.
- Represents a personal quality, priority, or skill that supports a goal.

### 2.4 Connection (edge)
- A **one-directional arrow** linking two goals (or a goal to the start point).
- Semantics: the source is a **subgoal / prerequisite** feeding the target.
- When a link is created, the **subgoal appears in the target goal's description**
  (i.e., the target lists its incoming subgoals).

---

## 3. Interaction Model

### 3.1 Canvas
- **Infinite** pannable surface with a visible **grid**.
- **Zoomable** in/out.
- Nodes snap to **grid intersections**.

### 3.2 Creating goals
- Tap/click an empty intersection → creates a new goal at that point.
- New goal opens in the left panel for naming/description/color/traits.

### 3.3 Linking goals
- User draws a **one-way arrow** from one goal to another.
- The connection is directional (subgoal → goal).
- Target goal's panel then displays the linked subgoal.

### 3.4 Left panel
- Context-sensitive detail/description panel.
- Shows the currently selected node (start point or goal):
  - Name, description, color, traits, list of subgoals.
- Editing here updates the canvas.

---

## 4. Zoom & Sizing Rules

- A goal's **world-space size is fixed at placement** from the current zoom:
  `worldRadius = BASE_NODE_RADIUS / zoomAtPlacement`.
  - Rendered size at placement is always ~20 px.
  - Placing while **zoomed in** creates a physically **smaller** goal (fine detail);
    placing while **zoomed out** creates a **larger** goal.
- Rendered size then scales with the current zoom: `screenRadius = worldRadius * zoom`.
  - **Zoom out** → detailed/nested goals collapse into small dots.
  - **Zoom in** → those dots grow and become editable, readable nodes.
- The **grid is adaptive**: it subdivides by a fixed factor as you zoom in (fine +
  coarse levels) so spacing stays readable, and merges upward as you zoom out.
- New goals **snap to the current fine grid**, so deeper zoom allows finer placement.

> Resolved: we use the **level-of-detail** model (placement-relative world size),
> not constant screen size — this matches "smaller goals appear as smaller dots."

---

## 5. MVP Scope

**In scope**
- Infinite, pannable, zoomable canvas with grid.
- Single start point at center per user (local, no auth required for MVP).
- Create goal at grid intersection.
- Select a node → left panel with name, description, color, traits.
- Assign/manage traits (simple tag list).
- Draw one-directional connections between nodes.
- Show incoming subgoals in a node's panel.
- Random default color + color picker.
- Zoom in/out with grid + fixed/relative node sizing.
- Persist the graph (local storage first; backend later).

**Out of scope (for now)**
- User accounts / multi-user / auth.
- Real-time collaboration.
- Mobile-native apps.
- Sharing/export.
- Progress tracking / completion states / analytics.

---

## 6. Open Questions

1. ~~Sizing model — constant screen size vs. level-of-detail.~~ **Resolved:
   level-of-detail (placement-relative world size) + adaptive subdividing grid.**
2. Can a node connect to the start point, or only goals to goals?
3. Are cycles allowed, or must the graph be a DAG?
4. Trait model — free-form tags vs. a predefined library with categories?
5. Should traits have weights/scores that aggregate up the graph?
6. Persistence — how long before we need a real backend & accounts?
7. Undo/redo expectations for MVP.

---

## 7. Glossary

| Term | Meaning |
|------|---------|
| Start point | The root "You" node at canvas center. |
| Goal | A node the user wants to achieve. |
| Subgoal | A goal that feeds into another via a directed edge. |
| Trait | A tag/quality assigned to the start point or a goal. |
| Connection | A one-directional arrow (subgoal → goal). |
| Zoom factor | Current canvas scale; drives node rendering size. |
