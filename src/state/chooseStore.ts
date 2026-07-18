/** A tiny promise-based "Copy or Move?" chooser, shared across the app so any
 *  drag-and-drop handler can await the user's choice. Mount <CopyMoveDialog />
 *  once near the app root; call chooseCopyOrMove() from anywhere. */

import { create } from "zustand";

export type TransferChoice = "copy" | "move";

interface ChooseState {
  open: boolean;
  label: string;
  resolve: ((choice: TransferChoice | null) => void) | null;
  ask: (label: string) => Promise<TransferChoice | null>;
  pick: (choice: TransferChoice | null) => void;
}

export const useChooseStore = create<ChooseState>((set, get) => ({
  open: false,
  label: "",
  resolve: null,
  ask: (label) =>
    new Promise<TransferChoice | null>((resolve) => {
      // If a previous prompt is somehow still open, cancel it first.
      get().resolve?.(null);
      set({ open: true, label, resolve });
    }),
  pick: (choice) => {
    const { resolve } = get();
    set({ open: false, label: "", resolve: null });
    resolve?.(choice);
  },
}));

/** Ask the user whether to copy or move. Resolves null if cancelled. */
export function chooseCopyOrMove(label: string): Promise<TransferChoice | null> {
  return useChooseStore.getState().ask(label);
}
