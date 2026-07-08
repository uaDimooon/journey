/** Pure geometry: adaptive grid, camera transforms, and zoom-relative sizing. */

import type { GraphNode, Vec2 } from "./types";

/** Reference grid spacing in world units at zoom 1. */
export const BASE_GRID = 60;

/** Base node radius in screen pixels at the zoom it was placed. */
export const BASE_NODE_RADIUS = 20;

/** How many fine cells make up one coarse cell (grid subdivision factor). */
export const GRID_SUBDIVISIONS = 5;

/** Smallest on-screen spacing (px) allowed for the fine grid before it merges up. */
const MIN_FINE_PX = 16;

export interface Camera {
  /** World coordinate at the center of the viewport. */
  x: number;
  y: number;
  /** Screen pixels per world unit. */
  zoom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export function worldToScreen(world: Vec2, cam: Camera, vp: Viewport): Vec2 {
  return {
    x: (world.x - cam.x) * cam.zoom + vp.width / 2,
    y: (world.y - cam.y) * cam.zoom + vp.height / 2,
  };
}

export function screenToWorld(screen: Vec2, cam: Camera, vp: Viewport): Vec2 {
  return {
    x: (screen.x - vp.width / 2) / cam.zoom + cam.x,
    y: (screen.y - vp.height / 2) / cam.zoom + cam.y,
  };
}

/**
 * The world-space spacing of the finest visible grid at the given zoom.
 * As you zoom in, this subdivides by GRID_SUBDIVISIONS to keep the on-screen
 * spacing readable; as you zoom out, it merges upward.
 */
export function gridStepWorld(zoom: number): number {
  let step = BASE_GRID;
  const screenPx = () => step * zoom;
  while (screenPx() >= MIN_FINE_PX * GRID_SUBDIVISIONS) step /= GRID_SUBDIVISIONS;
  while (screenPx() < MIN_FINE_PX) step *= GRID_SUBDIVISIONS;
  return step;
}

/** Snap a world point to the nearest intersection of the current fine grid. */
export function snapWorldToGrid(world: Vec2, zoom: number): Vec2 {
  const step = gridStepWorld(zoom);
  return {
    x: Math.round(world.x / step) * step,
    y: Math.round(world.y / step) * step,
  };
}

/**
 * World radius for a goal placed at the given zoom. Placing while zoomed in
 * yields a physically smaller goal (a fine detail); placing while zoomed out
 * yields a larger goal. Rendered size at placement is always BASE_NODE_RADIUS px.
 */
export function goalWorldRadius(zoom: number): number {
  return BASE_NODE_RADIUS / zoom;
}

/** Rendered node radius in screen pixels. */
export function nodeScreenRadius(node: GraphNode, cam: Camera): number {
  return node.size * cam.zoom;
}

export function clampZoom(zoom: number): number {
  return Math.min(40, Math.max(0.02, zoom));
}
