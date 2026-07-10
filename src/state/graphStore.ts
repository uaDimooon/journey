/** Graph ViewModel: holds the graph and exposes mutation actions.
 *  The server is the source of truth; this store is hydrated on login and its
 *  changes are synced back. Imports domain logic only. */

import { create } from "zustand";
import type { Graph, GraphNode, Id, Vec2 } from "../domain/types";
import {
  createGoal,
  createInitialGraph,
  isPositionOccupied,
  makeId,
  normalizeGraph,
  tryCreateEdge,
} from "../domain/graph";

interface GraphState {
  graph: Graph;
  /** True once a journey's graph has been loaded from the server. */
  hydrated: boolean;
  /** The id of the journey this graph belongs to (null until loaded). */
  journeyId: string | null;
  /** Replace the whole graph for a given journey (e.g. after loading). */
  setGraph: (graph: Graph, journeyId: string) => void;
  /** Create a goal at a world position with a world-space size. Returns id or null. */
  addGoal: (pos: Vec2, size: number) => Id | null;
  /** Move a node to a new world position. */
  moveNode: (id: Id, pos: Vec2) => void;
  /** Set a node's world-space radius (clamped). */
  resizeNode: (id: Id, size: number) => void;
  updateNode: (id: Id, patch: Partial<Omit<GraphNode, "id" | "kind">>) => void;
  removeNode: (id: Id) => void;
  /** Attempt to link from -> to. Returns an error message, or null on success. */
  linkNodes: (from: Id, to: Id) => string | null;
  /** Remove the link (edge) from `from` to `to`, if present. */
  unlink: (from: Id, to: Id) => void;
  /** Add a trait (by name) to a node. */
  addTrait: (id: Id, name: string) => void;
  removeTrait: (id: Id, traitId: Id) => void;
  renameTrait: (id: Id, traitId: Id, name: string) => void;
  toggleTrait: (id: Id, traitId: Id) => void;
  /** Reorder a node's traits by moving one from `fromIndex` to `toIndex`. */
  reorderTraits: (id: Id, fromIndex: number, toIndex: number) => void;
  reset: () => void;
}

export const useGraphStore = create<GraphState>()((set, get) => ({
  graph: createInitialGraph(),
  hydrated: false,
  journeyId: null,

  setGraph: (graph, journeyId) => {
    set({ graph: normalizeGraph(graph), hydrated: true, journeyId });
  },

  addGoal: (pos, size) => {
    const { graph } = get();
    if (isPositionOccupied(graph, pos, size)) return null;
    const goal = createGoal(pos, size);
    set({
      graph: {
        ...graph,
        nodes: { ...graph.nodes, [goal.id]: goal },
      },
        });
        return goal.id;
      },

      moveNode: (id, pos) =>
        set((s) => {
          const node = s.graph.nodes[id];
          if (!node) return s;
          return {
            graph: {
              ...s.graph,
              nodes: { ...s.graph.nodes, [id]: { ...node, pos } },
            },
          };
        }),

      resizeNode: (id, size) =>
        set((s) => {
          const node = s.graph.nodes[id];
          if (!node) return s;
          const clamped = Math.max(3, Math.min(5000, size));
          return {
            graph: {
              ...s.graph,
              nodes: { ...s.graph.nodes, [id]: { ...node, size: clamped } },
            },
          };
        }),

      updateNode: (id, patch) =>
        set((s) => {
          const node = s.graph.nodes[id];
          if (!node) return s;
          return {
            graph: {
              ...s.graph,
              nodes: { ...s.graph.nodes, [id]: { ...node, ...patch } },
            },
          };
        }),

      removeNode: (id) =>
        set((s) => {
          const node = s.graph.nodes[id];
          if (!node || node.kind === "start") return s;
          const nodes = { ...s.graph.nodes };
          delete nodes[id];
          const edges = Object.fromEntries(
            Object.entries(s.graph.edges).filter(
              ([, e]) => e.from !== id && e.to !== id,
            ),
          );
          return { graph: { nodes, edges } };
        }),

      linkNodes: (from, to) => {
        const { graph } = get();
        const result = tryCreateEdge(graph, from, to);
        if (!result.ok || !result.edge) return result.reason ?? "Cannot link.";
        set({
          graph: {
            ...graph,
            edges: { ...graph.edges, [result.edge.id]: result.edge },
          },
        });
        return null;
      },

      unlink: (from, to) =>
        set((s) => {
          const edges = Object.fromEntries(
            Object.entries(s.graph.edges).filter(
              ([, e]) => !(e.from === from && e.to === to),
            ),
          );
          return { graph: { ...s.graph, edges } };
        }),

      addTrait: (id, name) =>
        set((s) => {
          const node = s.graph.nodes[id];
          const t = name.trim();
          if (!node || !t || node.traits.some((tr) => tr.name === t)) return s;
          const trait = { id: makeId("trait"), name: t, done: false };
          return {
            graph: {
              ...s.graph,
              nodes: {
                ...s.graph.nodes,
                [id]: { ...node, traits: [...node.traits, trait] },
              },
            },
          };
        }),

      removeTrait: (id, traitId) =>
        set((s) => {
          const node = s.graph.nodes[id];
          if (!node) return s;
          return {
            graph: {
              ...s.graph,
              nodes: {
                ...s.graph.nodes,
                [id]: {
                  ...node,
                  traits: node.traits.filter((t) => t.id !== traitId),
                },
              },
            },
          };
        }),

      renameTrait: (id, traitId, name) =>
        set((s) => {
          const node = s.graph.nodes[id];
          const t = name.trim();
          if (!node || !t) return s;
          return {
            graph: {
              ...s.graph,
              nodes: {
                ...s.graph.nodes,
                [id]: {
                  ...node,
                  traits: node.traits.map((tr) =>
                    tr.id === traitId ? { ...tr, name: t } : tr,
                  ),
                },
              },
            },
          };
        }),

      toggleTrait: (id, traitId) =>
        set((s) => {
          const node = s.graph.nodes[id];
          if (!node) return s;
          return {
            graph: {
              ...s.graph,
              nodes: {
                ...s.graph.nodes,
                [id]: {
                  ...node,
                  traits: node.traits.map((tr) =>
                    tr.id === traitId ? { ...tr, done: !tr.done } : tr,
                  ),
                },
              },
            },
          };
        }),

      reorderTraits: (id, fromIndex, toIndex) =>
        set((s) => {
          const node = s.graph.nodes[id];
          if (!node) return s;
          const traits = [...node.traits];
          if (
            fromIndex < 0 ||
            fromIndex >= traits.length ||
            toIndex < 0 ||
            toIndex >= traits.length ||
            fromIndex === toIndex
          ) {
            return s;
          }
          const [moved] = traits.splice(fromIndex, 1);
          traits.splice(toIndex, 0, moved);
          return {
            graph: {
              ...s.graph,
              nodes: { ...s.graph.nodes, [id]: { ...node, traits } },
            },
          };
        }),

      reset: () => set({ graph: createInitialGraph(), hydrated: false, journeyId: null }),
}));
