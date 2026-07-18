/** Graph ViewModel: holds the graph and exposes mutation actions.
 *  The server is the source of truth; this store is hydrated on login and its
 *  changes are synced back. Imports domain logic only. */

import { create } from "zustand";
import type { Graph, GraphNode, Id, TraitAttachment, Vec2 } from "../domain/types";
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
  /** Add a fully-formed trait (used for imports). Returns the new trait id, or null. */
  addTraitDetailed: (
    id: Id,
    trait: {
      name: string;
      description?: string;
      attachments?: TraitAttachment[];
      cover?: TraitAttachment | null;
    },
  ) => Id | null;
  removeTrait: (id: Id, traitId: Id) => void;
  renameTrait: (id: Id, traitId: Id, name: string) => void;  /** Set a trait's description. */
  setTraitDescription: (id: Id, traitId: Id, description: string) => void;
  /** Attach a file/image reference to a trait. */
  addTraitAttachment: (id: Id, traitId: Id, attachment: TraitAttachment) => void;
  /** Remove an attachment reference from a trait. */
  removeTraitAttachment: (id: Id, traitId: Id, attachmentId: Id) => void;
  /** Set or clear a trait's square cover image. */
  setTraitCover: (id: Id, traitId: Id, cover: TraitAttachment | null) => void;
  toggleTrait: (id: Id, traitId: Id) => void;
  /** Reorder a node's traits by moving one from `fromIndex` to `toIndex`. */
  reorderTraits: (id: Id, fromIndex: number, toIndex: number) => void;
  /** Move a whole trait from one node to another (reassign). */
  moveTrait: (fromNodeId: Id, traitId: Id, toNodeId: Id) => void;
  /** Move an attachment reference from one trait to another (possibly across nodes). */
  moveAttachment: (
    fromNodeId: Id,
    fromTraitId: Id,
    toNodeId: Id,
    toTraitId: Id,
    attachmentId: Id,
  ) => void;
  /** Merge extra content (attachments/description/cover) into an existing trait. */
  appendToTrait: (
    id: Id,
    traitId: Id,
    patch: {
      description?: string;
      attachments?: TraitAttachment[];
      cover?: TraitAttachment | null;
    },
  ) => void;
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
          const trait = { id: makeId("trait"), name: t, done: false, description: "", attachments: [] };
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

      addTraitDetailed: (id, t) => {
        if (!get().graph.nodes[id]) return null;
        const trait = {
          id: makeId("trait"),
          name: (t.name ?? "").trim() || "Untitled",
          done: false,
          description: t.description ?? "",
          attachments: t.attachments ?? [],
          cover: t.cover ?? null,
        };
        set((s) => {
          const node = s.graph.nodes[id];
          if (!node) return s;
          return {
            graph: {
              ...s.graph,
              nodes: {
                ...s.graph.nodes,
                [id]: { ...node, traits: [...node.traits, trait] },
              },
            },
          };
        });
        return trait.id;
      },

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

      setTraitDescription: (id, traitId, description) =>
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
                    tr.id === traitId ? { ...tr, description } : tr,
                  ),
                },
              },
            },
          };
        }),

      addTraitAttachment: (id, traitId, attachment) =>
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
                    tr.id === traitId
                      ? { ...tr, attachments: [...tr.attachments, attachment] }
                      : tr,
                  ),
                },
              },
            },
          };
        }),

      removeTraitAttachment: (id, traitId, attachmentId) =>
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
                    tr.id === traitId
                      ? {
                          ...tr,
                          attachments: tr.attachments.filter(
                            (a) => a.id !== attachmentId,
                          ),
                        }
                      : tr,
                  ),
                },
              },
            },
          };
        }),

      setTraitCover: (id, traitId, cover) =>
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
                    tr.id === traitId ? { ...tr, cover } : tr,
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

      moveTrait: (fromNodeId, traitId, toNodeId) =>
        set((s) => {
          if (fromNodeId === toNodeId) return s;
          const from = s.graph.nodes[fromNodeId];
          const to = s.graph.nodes[toNodeId];
          if (!from || !to) return s;
          const trait = from.traits.find((t) => t.id === traitId);
          if (!trait) return s;
          return {
            graph: {
              ...s.graph,
              nodes: {
                ...s.graph.nodes,
                [fromNodeId]: {
                  ...from,
                  traits: from.traits.filter((t) => t.id !== traitId),
                },
                [toNodeId]: { ...to, traits: [...to.traits, trait] },
              },
            },
          };
        }),

      moveAttachment: (fromNodeId, fromTraitId, toNodeId, toTraitId, attachmentId) =>
        set((s) => {
          if (fromNodeId === toNodeId && fromTraitId === toTraitId) return s;
          const from = s.graph.nodes[fromNodeId];
          const to = s.graph.nodes[toNodeId];
          if (!from || !to) return s;
          const fromTrait = from.traits.find((t) => t.id === fromTraitId);
          const toTrait = to.traits.find((t) => t.id === toTraitId);
          if (!fromTrait || !toTrait) return s;
          const att = fromTrait.attachments.find((a) => a.id === attachmentId);
          if (!att) return s;
          if (toTrait.attachments.some((a) => a.id === attachmentId)) return s;

          const stripFrom = (traits: typeof from.traits) =>
            traits.map((t) =>
              t.id === fromTraitId
                ? {
                    ...t,
                    attachments: t.attachments.filter((a) => a.id !== attachmentId),
                  }
                : t,
            );
          const addTo = (traits: typeof to.traits) =>
            traits.map((t) =>
              t.id === toTraitId
                ? { ...t, attachments: [...t.attachments, att] }
                : t,
            );

          if (fromNodeId === toNodeId) {
            return {
              graph: {
                ...s.graph,
                nodes: {
                  ...s.graph.nodes,
                  [fromNodeId]: { ...from, traits: addTo(stripFrom(from.traits)) },
                },
              },
            };
          }
          return {
            graph: {
              ...s.graph,
              nodes: {
                ...s.graph.nodes,
                [fromNodeId]: { ...from, traits: stripFrom(from.traits) },
                [toNodeId]: { ...to, traits: addTo(to.traits) },
              },
            },
          };
        }),

      appendToTrait: (id, traitId, patch) =>
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
                  traits: node.traits.map((tr) => {
                    if (tr.id !== traitId) return tr;
                    const existingIds = new Set(tr.attachments.map((a) => a.id));
                    const added = (patch.attachments ?? []).filter(
                      (a) => !existingIds.has(a.id),
                    );
                    const description = patch.description?.trim()
                      ? tr.description
                        ? `${tr.description}\n\n${patch.description.trim()}`
                        : patch.description.trim()
                      : tr.description;
                    return {
                      ...tr,
                      description,
                      attachments: [...tr.attachments, ...added],
                      cover: tr.cover ?? patch.cover ?? null,
                    };
                  }),
                },
              },
            },
          };
        }),

      reset: () => set({ graph: createInitialGraph(), hydrated: false, journeyId: null }),
}));
