/** Selection & interaction-mode ViewModel. */

import { create } from "zustand";
import type { Id } from "../domain/types";

interface SelectionState {
  selectedId: Id | null;
  /** When set, the next node click completes a link FROM this node. */
  linkingFrom: Id | null;
  /** Transient status message (e.g. link errors). */
  status: string | null;

  select: (id: Id | null) => void;
  startLinking: (id: Id) => void;
  cancelLinking: () => void;
  setStatus: (msg: string | null) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedId: null,
  linkingFrom: null,
  status: null,

  select: (id) => set({ selectedId: id }),
  startLinking: (id) => set({ linkingFrom: id, status: "Click a target node to link." }),
  cancelLinking: () => set({ linkingFrom: null, status: null }),
  setStatus: (status) => set({ status }),
}));
