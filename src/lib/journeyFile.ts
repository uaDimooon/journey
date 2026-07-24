/** Export/import a journey as a self-contained JSON file. The file bundles every
 *  referenced attachment's BYTES (base64) so images/files survive a round-trip
 *  across accounts or machines. On import the bytes are re-uploaded and the
 *  graph's attachment references are remapped to the new ids. */

import { api } from "../api/client";
import type { Graph, GraphNode, Trait, TraitAttachment } from "../domain/types";

export interface JourneyAttachment {
  id: string;
  name: string;
  type: string;
  /** Base64-encoded file bytes (no data: prefix). */
  data: string;
}

export interface JourneyExport {
  type: "journey";
  version: number;
  name: string;
  exportedAt: string;
  graph: Graph;
  /** Present in v2+: the actual bytes for every referenced attachment. */
  attachments?: JourneyAttachment[];
}

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// --- attachment collection / remapping --------------------------------------

/** Every distinct attachment reference in a graph (trait attachments + trait
 *  covers at any depth + goal covers), keyed by id. */
function collectRefs(graph: Graph): Map<string, TraitAttachment> {
  const refs = new Map<string, TraitAttachment>();
  const add = (a?: TraitAttachment | null) => {
    if (a && typeof a.id === "string" && !refs.has(a.id)) refs.set(a.id, a);
  };
  const walkTrait = (t: Trait) => {
    add(t.cover);
    (t.attachments ?? []).forEach(add);
    (t.children ?? []).forEach(walkTrait);
  };
  for (const node of Object.values(graph.nodes ?? {})) {
    add(node.cover);
    (node.traits ?? []).forEach(walkTrait);
  }
  return refs;
}

/** Return a copy of the graph with every attachment id remapped via `map`
 *  (ids missing from the map are left as-is). */
function remapGraph(graph: Graph, map: Map<string, string>): Graph {
  const ref = (a?: TraitAttachment | null): TraitAttachment | null | undefined =>
    a && map.has(a.id) ? { ...a, id: map.get(a.id)! } : a;
  const remapTrait = (t: Trait): Trait => ({
    ...t,
    cover: ref(t.cover) ?? null,
    attachments: (t.attachments ?? []).map((a) => ref(a) ?? a),
    children: (t.children ?? []).map(remapTrait),
  });
  const nodes: Record<string, GraphNode> = {};
  for (const [id, n] of Object.entries(graph.nodes ?? {})) {
    nodes[id] = {
      ...n,
      cover: ref(n.cover) ?? null,
      traits: (n.traits ?? []).map(remapTrait),
    };
  }
  return { nodes, edges: graph.edges ?? {} };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    r.onerror = () => reject(new Error("Could not read attachment."));
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: type || "application/octet-stream" });
}

// --- export ------------------------------------------------------------------

/** Build a self-contained export payload, fetching every attachment's bytes.
 *  `onProgress(done, total)` reports attachment-download progress. */
export async function buildJourneyExport(
  name: string,
  graph: Graph,
  onProgress?: (done: number, total: number) => void,
): Promise<JourneyExport> {
  const refs = [...collectRefs(graph).values()];
  const attachments: JourneyAttachment[] = [];
  let done = 0;
  onProgress?.(0, refs.length);
  for (const meta of refs) {
    try {
      const res = await fetch(api.attachmentUrl(meta.id), {
        credentials: "same-origin",
      });
      if (res.ok) {
        const blob = await res.blob();
        attachments.push({
          id: meta.id,
          name: meta.name || "file",
          type: meta.type || blob.type || "application/octet-stream",
          data: await blobToBase64(blob),
        });
      }
    } catch {
      /* skip an attachment we can't fetch (leaves a dangling ref, as before) */
    }
    onProgress?.(++done, refs.length);
  }
  return {
    type: "journey",
    version: 2,
    name,
    exportedAt: new Date().toISOString(),
    graph,
    attachments,
  };
}

/** Fetch attachment bytes, then download the journey as a .journey.json file. */
export async function downloadJourney(
  name: string,
  graph: Graph,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const payload = await buildJourneyExport(name, graph, onProgress);
  const blob = new Blob([JSON.stringify(payload)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(name) || "journey"}.journey.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// --- import ------------------------------------------------------------------

/** Parse an exported journey file. Accepts our export format (v1 or v2) or a
 *  bare graph. Throws with a friendly message if the file is not valid. */
export function parseJourneyFile(text: string): {
  name: string;
  graph: Graph;
  attachments: JourneyAttachment[];
} {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }

  const obj = data as Record<string, unknown>;
  const candidate = (obj?.graph ?? (obj?.nodes ? obj : null)) as
    | Record<string, unknown>
    | null;

  if (
    !candidate ||
    typeof candidate !== "object" ||
    typeof candidate.nodes !== "object" ||
    candidate.nodes === null
  ) {
    throw new Error("This file doesn't look like a journey export.");
  }

  const graph = {
    nodes: candidate.nodes,
    edges:
      candidate.edges && typeof candidate.edges === "object"
        ? candidate.edges
        : {},
  } as Graph;

  const attachments = Array.isArray(obj?.attachments)
    ? (obj.attachments as JourneyAttachment[]).filter(
        (a) => a && typeof a.id === "string" && typeof a.data === "string",
      )
    : [];

  const rawName = typeof obj?.name === "string" ? obj.name.trim() : "";
  return { name: rawName || "Imported journey", graph, attachments };
}

/** Re-upload bundled attachments and return a graph whose references point at
 *  the freshly-created attachment ids. `onProgress(done, total)` reports upload
 *  progress. If there are no bundled attachments, the graph is returned as-is. */
export async function restoreAttachments(
  graph: Graph,
  attachments: JourneyAttachment[],
  onProgress?: (done: number, total: number) => void,
): Promise<Graph> {
  if (attachments.length === 0) return graph;
  const map = new Map<string, string>();
  let done = 0;
  onProgress?.(0, attachments.length);
  for (const a of attachments) {
    try {
      const blob = base64ToBlob(a.data, a.type);
      const file = new File([blob], a.name || "file", {
        type: a.type || blob.type || "application/octet-stream",
      });
      const uploaded = await api.uploadAttachment(file);
      map.set(a.id, uploaded.id);
    } catch {
      /* skip a file that fails to restore (ref will dangle, as before) */
    }
    onProgress?.(++done, attachments.length);
  }
  return remapGraph(graph, map);
}
