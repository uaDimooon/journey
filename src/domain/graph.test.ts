import { describe, expect, it } from "vitest";
import { createGoal, createInitialGraph, nodeAtPoint } from "./graph";
import type { Graph } from "./types";
import { makeCamera, makeViewport } from "../../test/factories";

// Pure hit-test extracted from the Pixi renderer. Covers REQ-5.1 (accurate
// hit-testing at a node's rendered radius) and the small-node click floor.

function graphOf(nodes: ReturnType<typeof createGoal>[]): Graph {
  return { nodes: Object.fromEntries(nodes.map((n) => [n.id, n])), edges: {} };
}

const vp = makeViewport({ width: 800, height: 600 }); // center = (400, 300)

describe("nodeAtPoint (REQ-5.1)", () => {
  it("returns the node whose rendered circle contains the point", () => {
    const goal = createGoal({ x: 100, y: 0 }, 20); // screen (500,300) at zoom 1
    const graph = graphOf([goal]);
    const cam = makeCamera({ zoom: 1 });
    expect(nodeAtPoint(graph, cam, vp, { x: 505, y: 300 })?.id).toBe(goal.id);
  });

  it("returns null over empty space", () => {
    const goal = createGoal({ x: 100, y: 0 }, 20);
    const graph = graphOf([goal]);
    const cam = makeCamera({ zoom: 1 });
    // 40 px away from the node center (radius 20) -> miss.
    expect(nodeAtPoint(graph, cam, vp, { x: 540, y: 300 })).toBeNull();
  });

  it("keeps a tiny zoomed-out node clickable via the 8px floor", () => {
    const goal = createGoal({ x: 0, y: 0 }, 20); // eff*zoom = 2px, floored to 8
    const graph = graphOf([goal]);
    const cam = makeCamera({ zoom: 0.1 });
    // Node is at viewport center; a point 6px away is inside the 8px floor.
    expect(nodeAtPoint(graph, cam, vp, { x: 406, y: 300 })?.id).toBe(goal.id);
    // ...but a custom smaller floor would miss it.
    expect(nodeAtPoint(graph, cam, vp, { x: 406, y: 300 }, 4)).toBeNull();
  });

  it("returns the last node in iteration order when circles overlap", () => {
    const a = createGoal({ x: 0, y: 0 }, 20);
    const b = createGoal({ x: 0, y: 0 }, 20); // same spot, added after a
    const graph = graphOf([a, b]);
    const cam = makeCamera({ zoom: 1 });
    expect(nodeAtPoint(graph, cam, vp, { x: 400, y: 300 })?.id).toBe(b.id);
  });

  it("hits the start node at the viewport center by default", () => {
    const graph = createInitialGraph();
    const startId = Object.keys(graph.nodes)[0];
    const cam = makeCamera({ x: 0, y: 0, zoom: 1 });
    expect(nodeAtPoint(graph, cam, vp, { x: 400, y: 300 })?.id).toBe(startId);
  });
});
