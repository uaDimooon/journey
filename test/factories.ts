/** Test data builders. Prefer these over shared mutable fixtures so each test
 *  gets fresh, independent data (see docs/TESTING.md § Cross-cutting). */

import type { Camera, Viewport } from "../src/domain/geometry";
import type { Vec2 } from "../src/domain/types";

export function makeCamera(over: Partial<Camera> = {}): Camera {
  return { x: 0, y: 0, zoom: 1, ...over };
}

export function makeViewport(over: Partial<Viewport> = {}): Viewport {
  return { width: 800, height: 600, ...over };
}

export function makeVec(x = 0, y = 0): Vec2 {
  return { x, y };
}
