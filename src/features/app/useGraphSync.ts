/** Wires journeys + graph to the server: opens the initial journey and
 *  autosaves graph edits to the journey they belong to. */

import { useEffect } from "react";
import { api } from "../../api/client";
import { useGraphStore } from "../../state/graphStore";
import { useJourneysStore } from "../../state/journeysStore";

const SAVE_DEBOUNCE_MS = 600;

export function useGraphSync(userId: string): void {
  // Open the user's initial journey on login.
  useEffect(() => {
    useJourneysStore.getState().openInitial();
  }, [userId]);

  // Debounced autosave: writes to the journey the current graph belongs to.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useGraphStore.subscribe((state) => {
      if (!state.hydrated || !state.journeyId) return;
      if (useJourneysStore.getState().loading) return;
      const id = state.journeyId;
      const graph = state.graph;
      clearTimeout(timer);
      timer = setTimeout(() => {
        api.saveJourney(id, graph).catch(() => {
          // best-effort; a later change will retry
        });
      }, SAVE_DEBOUNCE_MS);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [userId]);
}

