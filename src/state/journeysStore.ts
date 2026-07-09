/** Journeys ViewModel: the list of the user's journeys and which one is open. */

import { create } from "zustand";
import { api, type JourneySummary } from "../api/client";
import { createInitialGraph } from "../domain/graph";
import { useGraphStore } from "./graphStore";
import { useSelectionStore } from "./selectionStore";

const LAST_KEY = "journey-current-id";

interface JourneysState {
  journeys: JourneySummary[];
  currentId: string | null;
  /** True while switching/loading a journey (suppresses graph autosave). */
  loading: boolean;
  /** Guards openInitial against double-invocation (e.g. React StrictMode). */
  initStarted: boolean;
  error: string | null;

  /** Load the list, then open the last-used (or create a default) journey. */
  openInitial: () => Promise<void>;
  open: (id: string) => Promise<void>;
  create: (name: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: () => void;
}

export const useJourneysStore = create<JourneysState>((set, get) => ({
  journeys: [],
  currentId: null,
  loading: false,
  initStarted: false,
  error: null,

  openInitial: async () => {
    if (get().initStarted) return; // set synchronously below before any await
    set({ initStarted: true, loading: true, error: null });
    try {
      let { journeys } = await api.listJourneys();
      if (journeys.length === 0) {
        const { journey } = await api.createJourney(
          "My Journey",
          createInitialGraph(),
        );
        journeys = [journey];
      }
      set({ journeys });
      const lastId = localStorage.getItem(LAST_KEY);
      const pick = journeys.find((j) => j.id === lastId) ?? journeys[0];
      await get().open(pick.id);
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  open: async (id) => {
    const { currentId } = get();
    const g = useGraphStore.getState();
    if (currentId === id && g.hydrated) return;

    // Flush the current journey before switching away.
    if (currentId && g.hydrated && g.journeyId === currentId) {
      try {
        await api.saveJourney(currentId, g.graph);
      } catch {
        // best-effort
      }
    }

    set({ loading: true, error: null });
    try {
      const { graph } = await api.getJourney(id);
      useSelectionStore.getState().select(null);
      useGraphStore.getState().setGraph(graph, id);
      set({ currentId: id });
      localStorage.setItem(LAST_KEY, id);
    } catch (err) {
      set({ error: (err as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  create: async (name) => {
    const { journey } = await api.createJourney(
      name || "Untitled journey",
      createInitialGraph(),
    );
    set({ journeys: [journey, ...get().journeys] });
    await get().open(journey.id);
  },

  rename: async (id, name) => {
    const clean = name.trim();
    if (!clean) return;
    await api.renameJourney(id, clean);
    set({
      journeys: get().journeys.map((j) =>
        j.id === id ? { ...j, name: clean } : j,
      ),
    });
  },

  remove: async (id) => {
    await api.deleteJourney(id);
    const remaining = get().journeys.filter((j) => j.id !== id);
    set({ journeys: remaining });
    if (get().currentId === id) {
      if (remaining.length > 0) {
        await get().open(remaining[0].id);
      } else {
        await get().create("My Journey");
      }
    }
  },

  clear: () => {
    localStorage.removeItem(LAST_KEY);
    set({ journeys: [], currentId: null, loading: false, initStarted: false, error: null });
  },
}));
