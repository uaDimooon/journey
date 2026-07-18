/** Cross-component drag state for reassigning a trait onto a goal on the canvas.
 *  The TraitEditor sets the payload on drag start; CanvasView reads it on drop. */

import { create } from "zustand";
import type { Id } from "../domain/types";

export interface TraitDragPayload {
  fromNodeId: Id;
  traitId: Id;
  name: string;
}

interface DragState {
  trait: TraitDragPayload | null;
  /** Goal id currently hovered as a drop target (for highlight/feedback). */
  overGoalId: Id | null;
  startTrait: (p: TraitDragPayload) => void;
  setOverGoal: (id: Id | null) => void;
  endTrait: () => void;
}

export const useDragStore = create<DragState>((set) => ({
  trait: null,
  overGoalId: null,
  startTrait: (p) => set({ trait: p, overGoalId: null }),
  setOverGoal: (id) => set({ overGoalId: id }),
  endTrait: () => set({ trait: null, overGoalId: null }),
}));
