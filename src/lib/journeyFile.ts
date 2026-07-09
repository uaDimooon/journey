/** Export/import a journey as a JSON file. */

import type { Graph } from "../domain/types";

export interface JourneyExport {
  type: "journey";
  version: number;
  name: string;
  exportedAt: string;
  graph: Graph;
}

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Trigger a download of the given journey as a .journey.json file. */
export function downloadJourney(name: string, graph: Graph): void {
  const payload: JourneyExport = {
    type: "journey",
    version: 1,
    name,
    exportedAt: new Date().toISOString(),
    graph,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
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

/** Parse an exported journey file. Accepts our export format or a bare graph.
 *  Throws with a friendly message if the file is not a valid journey. */
export function parseJourneyFile(text: string): { name: string; graph: Graph } {
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

  const rawName = typeof obj?.name === "string" ? obj.name.trim() : "";
  return { name: rawName || "Imported journey", graph };
}
