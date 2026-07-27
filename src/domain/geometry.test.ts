import { describe, expect, it } from "vitest";
import {
  BASE_NODE_RADIUS,
  clampZoom,
  goalWorldRadius,
  gridStepWorld,
  screenToWorld,
  snapWorldToGrid,
  worldToScreen,
} from "./geometry";
import { makeCamera, makeViewport } from "../../test/factories";

// Covers REQ-3.1/3.2 (camera + adaptive grid) and REQ-4.2 (LOD sizing).

describe("worldToScreen / screenToWorld", () => {
  it("REQ-3.1: maps the camera center to the viewport center", () => {
    const cam = makeCamera({ x: 100, y: 50, zoom: 2 });
    const vp = makeViewport({ width: 800, height: 600 });
    expect(worldToScreen({ x: 100, y: 50 }, cam, vp)).toEqual({ x: 400, y: 300 });
  });

  it("REQ-3.1: round-trips world -> screen -> world", () => {
    const cam = makeCamera({ x: -30, y: 12, zoom: 1.5 });
    const vp = makeViewport();
    const world = { x: 42, y: -17 };
    const back = screenToWorld(worldToScreen(world, cam, vp), cam, vp);
    expect(back.x).toBeCloseTo(world.x, 6);
    expect(back.y).toBeCloseTo(world.y, 6);
  });

  it("REQ-3.1: scales offsets by zoom", () => {
    const cam = makeCamera({ x: 0, y: 0, zoom: 3 });
    const vp = makeViewport({ width: 200, height: 200 });
    // 10 world units right of center -> 30 px right of viewport center (100).
    expect(worldToScreen({ x: 10, y: 0 }, cam, vp).x).toBe(130);
  });
});

describe("gridStepWorld (adaptive grid)", () => {
  it("REQ-3.2: keeps the on-screen fine spacing within readable bounds", () => {
    for (const zoom of [0.05, 0.2, 1, 2.5, 10, 40]) {
      const screenPx = gridStepWorld(zoom) * zoom;
      expect(screenPx).toBeGreaterThanOrEqual(16);
      expect(screenPx).toBeLessThan(16 * 5);
    }
  });

  it("REQ-3.2: subdivides as you zoom in (finer world step)", () => {
    expect(gridStepWorld(10)).toBeLessThan(gridStepWorld(1));
  });
});

describe("snapWorldToGrid", () => {
  it("REQ-4.1: snaps to the nearest fine-grid intersection", () => {
    const zoom = 1;
    const step = gridStepWorld(zoom);
    const snapped = snapWorldToGrid({ x: step * 2 + 3, y: step * 5 - 4 }, zoom);
    expect(snapped.x).toBe(step * 2);
    expect(snapped.y).toBe(step * 5);
  });
});

describe("goalWorldRadius (level of detail)", () => {
  it("REQ-4.2: renders ~BASE_NODE_RADIUS px at placement zoom", () => {
    for (const zoom of [0.5, 1, 4]) {
      expect(goalWorldRadius(zoom) * zoom).toBeCloseTo(BASE_NODE_RADIUS, 6);
    }
  });

  it("REQ-4.2: placing while zoomed in yields a physically smaller goal", () => {
    expect(goalWorldRadius(4)).toBeLessThan(goalWorldRadius(1));
  });
});

describe("clampZoom", () => {
  it("clamps to the [0.02, 40] range", () => {
    expect(clampZoom(0.0001)).toBe(0.02);
    expect(clampZoom(1000)).toBe(40);
    expect(clampZoom(2.5)).toBe(2.5);
  });
});
