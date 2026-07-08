/** Auth ViewModel: current user + login/signup/logout actions. */

import { create } from "zustand";
import { api, type AuthUser } from "../api/client";
import { useGraphStore } from "./graphStore";
import { useSelectionStore } from "./selectionStore";

interface AuthState {
  user: AuthUser | null;
  /** True while the initial session check is in flight. */
  initializing: boolean;
  busy: boolean;
  error: string | null;

  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  initializing: true,
  busy: false,
  error: null,

  init: async () => {
    try {
      const { user } = await api.me();
      set({ user, initializing: false });
    } catch {
      set({ user: null, initializing: false });
    }
  },

  login: async (email, password) => {
    set({ busy: true, error: null });
    try {
      const { user } = await api.login(email, password);
      set({ user, busy: false });
      return true;
    } catch (err) {
      set({ busy: false, error: (err as Error).message });
      return false;
    }
  },

  signup: async (email, password) => {
    set({ busy: true, error: null });
    try {
      const { user } = await api.signup(email, password);
      set({ user, busy: false });
      return true;
    } catch (err) {
      set({ busy: false, error: (err as Error).message });
      return false;
    }
  },

  logout: async () => {
    try {
      await api.logout();
    } catch {
      // Ignore network errors on logout; clear locally regardless.
    }
    useGraphStore.getState().reset();
    useSelectionStore.getState().select(null);
    set({ user: null });
  },

  clearError: () => set({ error: null }),
}));
