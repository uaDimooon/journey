/** Thin fetch wrapper for the backend API. Always sends the session cookie. */

import type { Graph } from "../domain/types";

export interface AuthUser {
  id: string;
  email: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  signup: (email: string, password: string) =>
    request<{ user: AuthUser }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ user: AuthUser }>("/api/auth/me"),
  getGraph: () => request<{ graph: Graph | null }>("/api/graph"),
  saveGraph: (graph: Graph) =>
    request<{ ok: true }>("/api/graph", {
      method: "PUT",
      body: JSON.stringify({ graph }),
    }),
};
