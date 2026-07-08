/** Camera ViewModel: viewport pan/zoom state. */

import { create } from "zustand";
import { clampZoom, type Camera, type Viewport } from "../domain/geometry";
import type { Vec2 } from "../domain/types";

interface CameraState extends Camera {
  viewport: Viewport;
  setViewport: (vp: Viewport) => void;
  panBy: (dxScreen: number, dyScreen: number) => void;
  /** Zoom by a factor, keeping the given screen point anchored. */
  zoomAt: (factor: number, screenX: number, screenY: number) => void;
  /** Center the viewport on a world point, zooming only if the node would be
   *  too small or too large to see comfortably. */
  focusOn: (pos: Vec2, worldRadius: number) => void;
}

export const useCameraStore = create<CameraState>((set) => ({
  x: 0,
  y: 0,
  zoom: 1,
  viewport: { width: 800, height: 600 },

  setViewport: (viewport) => set({ viewport }),

  panBy: (dxScreen, dyScreen) =>
    set((s) => ({
      x: s.x - dxScreen / s.zoom,
      y: s.y - dyScreen / s.zoom,
    })),

  zoomAt: (factor, screenX, screenY) =>
    set((s) => {
      const nextZoom = clampZoom(s.zoom * factor);
      if (nextZoom === s.zoom) return s;
      const { width, height } = s.viewport;
      // World point under the cursor before zoom.
      const worldX = (screenX - width / 2) / s.zoom + s.x;
      const worldY = (screenY - height / 2) / s.zoom + s.y;
      // Keep that world point under the cursor after zoom.
      return {
        zoom: nextZoom,
        x: worldX - (screenX - width / 2) / nextZoom,
        y: worldY - (screenY - height / 2) / nextZoom,
      };
    }),

  focusOn: (pos, worldRadius) =>
    set((s) => {
      const screenRadius = worldRadius * s.zoom;
      // Only adjust zoom when the node is too small or too large on screen.
      let zoom = s.zoom;
      if (screenRadius < 16 || screenRadius > 160) {
        const TARGET_PX = 48;
        zoom = clampZoom(TARGET_PX / worldRadius);
      }
      return { x: pos.x, y: pos.y, zoom };
    }),
}));
