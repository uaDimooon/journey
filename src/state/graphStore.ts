/** Graph ViewModel: holds the graph and exposes mutation actions.
 *  The server is the source of truth; this store is hydrated on login and its
 *  changes are synced back. Imports domain logic only. */

import { create } from "zustand";
import type { Graph, GraphNode, Id, Vec2 } from "../domain/types";
import {
  createGoal,
  createStartNode,
  isPositionOccupied,
  tryCreateEdge,
} from "../domain/graph";

interface GraphState {
  graph: Graph;
  /** True once the graph has been loaded from the server for the current user. */
  hydrated: boolean;
  /** Replace the whole graph (e.g. after loading from the server). */
  setGraph: (graph: Graph) => void;
  /** Create a goal at a world position with a world-space size. Returns id or null. */
  addGoal: (pos: Vec2, size: number) => Id | null;
  /** Move a node to a new world position. */
  moveNode: (id: Id, pos: Vec2) => void;
  updateNode: (id: Id, patch: Partial<Omit<GraphNode, "id" | "kind">>) => void;
  removeNode: (id: Id) => void;
  /** Attempt to link from -> to. Returns an error message, or null on success. */
  linkNodes: (from: Id, to: Id) => string | null;
  addTrait: (id: Id, trait: string) => void;
  removeTrait: (id: Id, trait: string) => void;
  reset: () => void;
}

function initialGraph(): Graph {
  const start = createStartNode();
  return { nodes: { [start.id]: start }, edges: {} };
}

export const useGraphStore = create<GraphState>()((set, get) => ({
  graph: initialGraph(),
  hydrated: false,

  setGraph: (graph) => {
    // Normalize legacy nodes that predate the status field.
    const nodes: Graph["nodes"] = {};
    for (const [id, node] of Object.entries(graph.nodes)) {
      nodes[id] = { ...node, status: node.status ?? "next-up" };
    }
    set({ graph: { nodes, edges: graph.edges }, hydrated: true });
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

      addTrait: (id, trait) =>
        set((s) => {
          const node = s.graph.nodes[id];
          const t = trait.trim();
          if (!node || !t || node.traits.includes(t)) return s;
          return {
            graph: {
              ...s.graph,
              nodes: {
                ...s.graph.nodes,
                [id]: { ...node, traits: [...node.traits, t] },
              },
            },
          };
        }),

      removeTrait: (id, trait) =>
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
                  traits: node.traits.filter((t) => t !== trait),
                },
              },
            },
          };
        }),

      reset: () => set({ graph: initialGraph(), hydrated: false }),
}));
