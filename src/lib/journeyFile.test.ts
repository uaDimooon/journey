import { describe, expect, it } from "vitest";
import {
  buildJourneyExport,
  parseJourneyFile,
  type JourneyExport,
} from "./journeyFile";
import { createGoal, createInitialGraph } from "../domain/graph";
import type { Graph } from "../domain/types";

// UC-13: lossless journey export & import. These cover the pure structural
// round-trip (no attachment bytes, so no network is touched).

function sampleGraph(): Graph {
  const graph = createInitialGraph();
  const health = createGoal({ x: 100, y: 0 }, 20, "Health");
  health.traits = [
    {
      id: "trait_1",
      name: "Run weekly",
      done: false,
      description: "see https://example.com",
      attachments: [],
      cover: null,
      children: [],
    },
  ];
  graph.nodes[health.id] = health;
  return graph;
}

describe("buildJourneyExport (UC-13 / REQ-13.1)", () => {
  it("produces a v2 payload that carries the graph verbatim", async () => {
    const graph = sampleGraph();
    const payload = await buildJourneyExport("My Journey", graph);
    expect(payload.type).toBe("journey");
    expect(payload.version).toBe(2);
    expect(payload.name).toBe("My Journey");
    expect(payload.attachments).toEqual([]); // no refs -> nothing fetched
    expect(payload.graph).toEqual(graph);
  });
});

describe("parseJourneyFile (UC-13 / REQ-13.2)", () => {
  it("round-trips a graph through export -> JSON -> import", async () => {
    const graph = sampleGraph();
    const payload = await buildJourneyExport("Round Trip", graph);
    const parsed = parseJourneyFile(JSON.stringify(payload));
    expect(parsed.name).toBe("Round Trip");
    expect(parsed.graph).toEqual(graph);
    expect(parsed.attachments).toEqual([]);
  });

  it("accepts a bare graph (legacy) with no wrapper", () => {
    const graph = sampleGraph();
    const parsed = parseJourneyFile(JSON.stringify(graph));
    expect(Object.keys(parsed.graph.nodes)).toEqual(Object.keys(graph.nodes));
  });

  it("throws a friendly error on invalid JSON", () => {
    expect(() => parseJourneyFile("{not json")).toThrow(/valid JSON/i);
  });

  it("throws when the file is not a journey", () => {
    const notAJourney: Partial<JourneyExport> = { type: "journey", version: 2 };
    expect(() => parseJourneyFile(JSON.stringify(notAJourney))).toThrow(
      /journey export/i,
    );
  });
});
