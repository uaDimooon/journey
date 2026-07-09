/** Thin fetch wrapper for the backend API. Always sends the session cookie. */

import type { Graph } from "../domain/types";

export interface AuthUser {
  id: string;
  email: string;
}

export interface JourneySummary {
  id: string;
  name: string;
  updatedAt: number;
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

  listJourneys: () =>
    request<{ journeys: JourneySummary[] }>("/api/journeys"),
  createJourney: (name: string, graph: Graph) =>
    request<{ journey: JourneySummary }>("/api/journeys", {
      method: "POST",
      body: JSON.stringify({ name, graph }),
    }),
  getJourney: (id: string) =>
    request<{ journey: JourneySummary; graph: Graph }>(
      `/api/journeys/${encodeURIComponent(id)}`,
    ),
  saveJourney: (id: string, graph: Graph) =>
    request<{ ok: true; updatedAt: number }>(
      `/api/journeys/${encodeURIComponent(id)}`,
      { method: "PUT", body: JSON.stringify({ graph }) },
    ),
  renameJourney: (id: string, name: string) =>
    request<{ ok: true; name: string }>(
      `/api/journeys/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify({ name }) },
    ),
  deleteJourney: (id: string) =>
    request<{ ok: true }>(`/api/journeys/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};
