/** Pure graph logic: creation, edge validation (DAG), and queries. */

import type { Edge, Graph, GraphNode, Id, Trait, TraitAttachment, Vec2 } from "./types";
import { randomColor } from "./color";
import { BASE_NODE_RADIUS } from "./geometry";

let counter = 0;
export function makeId(prefix = "n"): Id {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

/** Coerce a raw trait (legacy string or object) into a Trait. */
export function normalizeTrait(raw: unknown): Trait {
  if (typeof raw === "string") {
    return { id: makeId("trait"), name: raw, done: false, description: "", attachments: [], cover: null };
  }
  const t = (raw ?? {}) as Partial<Trait>;
  const rawCover = t.cover as Partial<TraitAttachment> | null | undefined;
  const cover =
    rawCover && typeof rawCover.id === "string"
      ? { id: rawCover.id, name: rawCover.name ?? "", type: rawCover.type ?? "image/*" }
      : null;
  return {
    id: t.id ?? makeId("trait"),
    name: typeof t.name === "string" ? t.name : "",
    done: Boolean(t.done),
    description: typeof t.description === "string" ? t.description : "",
    attachments: Array.isArray(t.attachments) ? t.attachments : [],
    cover,
  };
}

/** Ensure a node has a status and structured traits (handles legacy data). */
export function normalizeNode(node: GraphNode): GraphNode {
  const rawTraits = Array.isArray(node.traits) ? node.traits : [];
  return {
    ...node,
    status: node.status ?? "next-up",
    traits: rawTraits.map(normalizeTrait),
  };
}

/** Normalize every node in a graph (legacy-data safe). */
export function normalizeGraph(graph: Graph): Graph {
  const nodes: Record<Id, GraphNode> = {};
  for (const [id, node] of Object.entries(graph.nodes)) {
    nodes[id] = normalizeNode(node);
  }
  return { nodes, edges: graph.edges ?? {} };
}

export function createStartNode(name = "You"): GraphNode {
  return {
    id: makeId("start"),
    kind: "start",
    name,
    description: "This is you — the starting point of your journey.",
    color: "#7dd3fc",
    traits: [],
    status: "next-up",
    pos: { x: 0, y: 0 },
    size: BASE_NODE_RADIUS * 1.4,
  };
}

export function createGoal(pos: Vec2, size: number, name = "New goal"): GraphNode {
  return {
    id: makeId("goal"),
    kind: "goal",
    name,
    description: "",
    color: randomColor(),
    traits: [],
    status: "next-up",
    pos,
    size,
  };
}

/** A fresh graph containing just the start node. */
export function createInitialGraph(): Graph {
  const start = createStartNode();
  return { nodes: { [start.id]: start }, edges: {} };
}

/** True if a node already sits at (approximately) this world position. */
export function isPositionOccupied(graph: Graph, pos: Vec2, radius: number): boolean {
  return Object.values(graph.nodes).some(
    (n) => Math.hypot(n.pos.x - pos.x, n.pos.y - pos.y) < Math.max(radius, n.size) * 0.5,
  );
}

/** Nodes that feed INTO `nodeId` (its subgoals). */
export function incomingNodes(graph: Graph, nodeId: Id): GraphNode[] {
  return Object.values(graph.edges)
    .filter((e) => e.to === nodeId)
    .map((e) => graph.nodes[e.from])
    .filter(Boolean);
}/** Nodes that `nodeId` feeds into. */
export function outgoingNodes(graph: Graph, nodeId: Id): GraphNode[] {
  return Object.values(graph.edges)
    .filter((e) => e.from === nodeId)
    .map((e) => graph.nodes[e.to])
    .filter(Boolean);
}

export function edgeExists(graph: Graph, from: Id, to: Id): boolean {
  return Object.values(graph.edges).some(
    (e) => e.from === from && e.to === to,
  );
}

/** How much each child's effective size contributes to its parent. */
export const CHILD_SIZE_FACTOR = 0.5;

/**
 * Effective (rendered) size per node: a node's own intrinsic `size` plus a
 * factor of the sum of its children's effective sizes. So a "master" goal is
 * bigger than its subgoals, more children make it bigger, and the effect
 * cascades up through intermediate goals. Memoized over the DAG.
 */
export function effectiveSizes(graph: Graph): Record<Id, number> {
  const memo: Record<Id, number> = {};
  const visiting = new Set<Id>();

  const eff = (id: Id): number => {
    const cached = memo[id];
    if (cached !== undefined) return cached;
    const node = graph.nodes[id];
    if (!node) return 0;
    if (visiting.has(id)) return node.size; // cycle guard (DAG shouldn't hit this)
    visiting.add(id);
    let childSum = 0;
    for (const child of incomingNodes(graph, id)) {
      childSum += eff(child.id);
    }
    visiting.delete(id);
    const value = node.size + CHILD_SIZE_FACTOR * childSum;
    memo[id] = value;
    return value;
  };

  for (const id of Object.keys(graph.nodes)) eff(id);
  return memo;
}

/** Would adding from -> to create a cycle? Keeps the graph a DAG. */
export function wouldCreateCycle(graph: Graph, from: Id, to: Id): boolean {
  if (from === to) return true;
  // If `to` can already reach `from`, adding from->to closes a loop.
  const stack: Id[] = [to];
  const seen = new Set<Id>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === from) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of outgoingNodes(graph, current)) {
      stack.push(next.id);
    }
  }
  return false;
}

export interface LinkResult {
  ok: boolean;
  reason?: string;
  edge?: Edge;
}

export function tryCreateEdge(graph: Graph, from: Id, to: Id): LinkResult {
  if (from === to) return { ok: false, reason: "A node cannot link to itself." };
  if (edgeExists(graph, from, to))
    return { ok: false, reason: "That connection already exists." };
  if (wouldCreateCycle(graph, from, to))
    return { ok: false, reason: "That would create a cycle." };
  return {
    ok: true,
    edge: { id: makeId("edge"), from, to },
  };
}

/** Horizontal gap (world units) placed between merged clusters. */
const MERGE_GAP = 200;

function findStart(graph: Graph): GraphNode | undefined {
  return Object.values(graph.nodes).find((n) => n.kind === "start");
}

/** Offset that places the source cluster just to the right of the target cluster. */
function mergeOffset(target: Graph, source: Graph): Vec2 {
  const t = Object.values(target.nodes);
  const s = Object.values(source.nodes);
  if (t.length === 0 || s.length === 0) return { x: 0, y: 0 };
  const targetMaxX = Math.max(...t.map((n) => n.pos.x + n.size));
  const sourceMinX = Math.min(...s.map((n) => n.pos.x - n.size));
  return { x: targetMaxX - sourceMinX + MERGE_GAP, y: 0 };
}

/**
 * Merge `source` into `target`, preserving all goals, traits, statuses, colors,
 * and links. The two start nodes are unified (source start folds into target
 * start, unioning traits). Incoming nodes get fresh ids and are shifted right so
 * nothing overlaps. Returns a new graph; inputs are not mutated.
 */
export function mergeGraphs(target: Graph, source: Graph): Graph {
  target = normalizeGraph(target);
  source = normalizeGraph(source);
  const targetStart = findStart(target);
  const sourceStart = findStart(source);
  const offset = mergeOffset(target, source);

  const idMap = new Map<Id, Id>();
  const nodes: Record<Id, GraphNode> = { ...target.nodes };

  // Fold the source start into the target start (union their traits by name).
  if (sourceStart && targetStart) {
    idMap.set(sourceStart.id, targetStart.id);
    const seen = new Set(targetStart.traits.map((t) => t.name));
    const traits = [...targetStart.traits];
    for (const t of sourceStart.traits) {
      if (!seen.has(t.name)) {
        traits.push({ ...t, id: makeId("trait") });
        seen.add(t.name);
      }
    }
    nodes[targetStart.id] = { ...targetStart, traits };
  }

  // Copy every non-start source node with a fresh id and offset position.
  for (const node of Object.values(source.nodes)) {
    if (node.kind === "start") continue;
    const newId = makeId("goal");
    idMap.set(node.id, newId);
    nodes[newId] = {
      ...node,
      id: newId,
      traits: node.traits.map((t) => ({ ...t, id: makeId("trait") })),
      pos: { x: node.pos.x + offset.x, y: node.pos.y + offset.y },
    };
  }

  // Copy source edges with remapped endpoints, skipping self-loops/duplicates.
  const edges: Record<Id, Edge> = { ...target.edges };
  for (const edge of Object.values(source.edges)) {
    const from = idMap.get(edge.from);
    const to = idMap.get(edge.to);
    if (!from || !to || from === to) continue;
    if (Object.values(edges).some((e) => e.from === from && e.to === to)) continue;
    const newId = makeId("edge");
    edges[newId] = { id: newId, from, to };
  }

  return { nodes, edges };
}
