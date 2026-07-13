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

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size?: number;
}

/** Maximum upload size (must match the server limit). */
export const MAX_ATTACHMENT_MB = 25;
export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;

export interface TelegramStatus {
  enabled: boolean;
  botUsername: string | null;
  connected: boolean;
  username: string | null;
  name: string | null;
  linkedAt: number | null;
}

export interface InboxItem {
  id: string;
  source: string | null;
  text: string | null;
  mediaKind: "image" | "video" | "audio" | "file" | null;
  date: number;
  attachments: Attachment[];
}

export interface InstagramItem {
  id: string;
  url: string;
  shortcode: string | null;
  mediaType: "reel" | "post" | null;
  text: string | null;
  date: number;
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

  /** URL to fetch/display an attachment. */
  attachmentUrl: (id: string) => `/api/attachments/${encodeURIComponent(id)}`,
  /** Upload a file with progress; returns its stored metadata. */
  uploadAttachment: (
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<Attachment> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/attachments?name=${encodeURIComponent(file.name)}`);
      xhr.withCredentials = true;
      xhr.setRequestHeader(
        "Content-Type",
        file.type || "application/octet-stream",
      );
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        let data: { attachment?: Attachment; error?: string } | null = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          data = null;
        }
        if (xhr.status >= 200 && xhr.status < 300 && data?.attachment) {
          resolve(data.attachment);
        } else if (xhr.status === 413) {
          reject(new Error(`File is too large (max ${MAX_ATTACHMENT_MB} MB).`));
        } else {
          reject(new Error(data?.error ?? `Upload failed (${xhr.status}).`));
        }
      };
      xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
      xhr.send(file);
    }),
  deleteAttachment: (id: string) =>
    request<{ ok: true }>(`/api/attachments/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  // --- Telegram integration ---
  telegramStatus: () =>
    request<TelegramStatus>("/api/telegram/status"),
  telegramLinkCode: () =>
    request<{ code: string; botUsername: string | null; deepLink: string | null }>(
      "/api/telegram/link-code",
      { method: "POST" },
    ),
  telegramDisconnect: () =>
    request<{ ok: true }>("/api/telegram/disconnect", { method: "POST" }),
  telegramInbox: () =>
    request<{ items: InboxItem[] }>("/api/telegram/inbox"),
  telegramInboxImport: (id: string) =>
    request<{ ok: true }>(
      `/api/telegram/inbox/${encodeURIComponent(id)}/import`,
      { method: "POST" },
    ),
  telegramInboxDismiss: (id: string) =>
    request<{ ok: true }>(
      `/api/telegram/inbox/${encodeURIComponent(id)}/dismiss`,
      { method: "POST" },
    ),

  // --- Instagram inbox ---
  instagramInbox: () =>
    request<{ items: InstagramItem[] }>("/api/instagram/inbox"),
  instagramInboxImport: (id: string) =>
    request<{ ok: true }>(
      `/api/instagram/inbox/${encodeURIComponent(id)}/import`,
      { method: "POST" },
    ),
  instagramInboxDismiss: (id: string) =>
    request<{ ok: true }>(
      `/api/instagram/inbox/${encodeURIComponent(id)}/dismiss`,
      { method: "POST" },
    ),
};
