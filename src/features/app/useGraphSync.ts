/** Wires the graph store to the server: loads on mount, autosaves on change. */

import { useEffect } from "react";
import { api } from "../../api/client";
import { useGraphStore } from "../../state/graphStore";

const SAVE_DEBOUNCE_MS = 600;

export function useGraphSync(userId: string): void {
  // Load the user's graph once when they log in.
  useEffect(() => {
    let active = true;
    api
      .getGraph()
      .then(({ graph }) => {
        if (!active) return;
        const store = useGraphStore.getState();
        // If the user has no saved graph yet, keep the current (fresh) one and
        // mark it hydrated so it gets saved. Otherwise load the saved graph.
        store.setGraph(graph ?? store.graph);
      })
      .catch(() => {
        // On failure, still mark hydrated so the app is usable offline-ish.
        const store = useGraphStore.getState();
        store.setGraph(store.graph);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  // Debounced autosave whenever the graph changes (after hydration).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useGraphStore.subscribe((state) => {
      if (!state.hydrated) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        api.saveGraph(state.graph).catch(() => {
          // Best-effort; a later change will retry.
        });
      }, SAVE_DEBOUNCE_MS);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [userId]);
}
