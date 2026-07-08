/** PixiJS renderer: imperative adapter that subscribes to the stores and draws
 *  the grid, edges, and nodes. It owns no application state. */

import { Application, Container, Graphics, Text } from "pixi.js";
import {
  GRID_SUBDIVISIONS,
  goalWorldRadius,
  gridStepWorld,
  nodeScreenRadius,
  screenToWorld,
  snapWorldToGrid,
  worldToScreen,
  type Camera,
  type Viewport,
} from "../domain/geometry";
import { hexToNumber } from "../domain/color";
import type { GraphNode, Vec2 } from "../domain/types";
import { useCameraStore } from "../state/cameraStore";
import { useGraphStore } from "../state/graphStore";
import { useSelectionStore } from "../state/selectionStore";

const DRAG_THRESHOLD = 4; // px

export class CanvasRenderer {
  private app = new Application();
  private gridLayer = new Graphics();
  private edgeLayer = new Graphics();
  private nodeLayer = new Container();
  private unsub: Array<() => void> = [];
  private resizeObserver?: ResizeObserver;

  private pointerDown = false;
  private moved = false;
  private lastX = 0;
  private lastY = 0;
  private draggingId: string | null = null;
  private initialized = false;
  private destroyed = false;

  async init(container: HTMLDivElement): Promise<void> {
    await this.app.init({
      background: "#0f1115",
      antialias: true,
      resizeTo: container,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    // Guard against unmount happening during async init.
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    container.appendChild(this.app.canvas);

    this.app.stage.addChild(this.gridLayer, this.edgeLayer, this.nodeLayer);

    this.syncViewport();
    this.attachEvents();

    // Redraw on any relevant store change.
    this.unsub.push(useGraphStore.subscribe(() => this.redraw()));
    this.unsub.push(useCameraStore.subscribe(() => this.redraw()));
    this.unsub.push(useSelectionStore.subscribe(() => this.redraw()));

    this.resizeObserver = new ResizeObserver(() => {
      this.syncViewport();
      this.redraw();
    });
    this.resizeObserver.observe(container);

    this.initialized = true;
    this.redraw();
  }

  destroy(): void {
    this.destroyed = true;
    this.unsub.forEach((fn) => fn());
    this.unsub = [];
    this.resizeObserver?.disconnect();
    if (this.initialized) {
      this.app.destroy(true, { children: true });
      this.initialized = false;
    }
  }

  private syncViewport(): void {
    const { width, height } = this.app.screen;
    useCameraStore.getState().setViewport({ width, height });
  }

  private get cam(): Camera {
    const s = useCameraStore.getState();
    return { x: s.x, y: s.y, zoom: s.zoom };
  }

  private get vp(): Viewport {
    return useCameraStore.getState().viewport;
  }

  private attachEvents(): void {
    const canvas = this.app.canvas;
    canvas.style.touchAction = "none";

    canvas.addEventListener("pointerdown", (e) => {
      this.pointerDown = true;
      this.moved = false;
      this.lastX = e.offsetX;
      this.lastY = e.offsetY;
      canvas.setPointerCapture(e.pointerId);

      // Grabbing a node (outside of linking mode) starts a move-drag and
      // selects it; empty space starts a pan.
      const linking = useSelectionStore.getState().linkingFrom;
      if (!linking) {
        const node = this.hitTest({ x: e.offsetX, y: e.offsetY });
        if (node) {
          this.draggingId = node.id;
          useSelectionStore.getState().select(node.id);
          canvas.style.cursor = "grabbing";
        }
      }
    });

    canvas.addEventListener("pointermove", (e) => {
      const dx = e.offsetX - this.lastX;
      const dy = e.offsetY - this.lastY;

      // Hover feedback when idle.
      if (!this.pointerDown) {
        const overNode = this.hitTest({ x: e.offsetX, y: e.offsetY });
        canvas.style.cursor = overNode ? "grab" : "default";
        return;
      }

      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        this.moved = true;
      }
      this.lastX = e.offsetX;
      this.lastY = e.offsetY;

      if (this.draggingId) {
        // Move the grabbed node, snapping to the current fine grid.
        const cam = this.cam;
        const world = screenToWorld({ x: e.offsetX, y: e.offsetY }, cam, this.vp);
        const pos = snapWorldToGrid(world, cam.zoom);
        useGraphStore.getState().moveNode(this.draggingId, pos);
      } else if (this.moved) {
        useCameraStore.getState().panBy(dx, dy);
      }
    });

    canvas.addEventListener("pointerup", (e) => {
      const wasDragging = this.draggingId !== null;
      this.pointerDown = false;
      this.draggingId = null;
      canvas.style.cursor = "default";
      // Only treat as a click if it wasn't a node move-drag.
      if (!this.moved && !wasDragging) {
        this.handleClick(e.offsetX, e.offsetY);
      }
    });

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      useCameraStore.getState().zoomAt(factor, e.offsetX, e.offsetY);
    }, { passive: false });
  }

  private hitTest(screen: Vec2): GraphNode | null {
    const { graph } = useGraphStore.getState();
    const cam = this.cam;
    const vp = this.vp;
    let hit: GraphNode | null = null;
    for (const node of Object.values(graph.nodes)) {
      const p = worldToScreen(node.pos, cam, vp);
      const r = Math.max(nodeScreenRadius(node, cam), 8);
      const dist = Math.hypot(screen.x - p.x, screen.y - p.y);
      if (dist <= r) hit = node;
    }
    return hit;
  }

  private handleClick(sx: number, sy: number): void {
    const selection = useSelectionStore.getState();
    const graphStore = useGraphStore.getState();
    const node = this.hitTest({ x: sx, y: sy });

    if (selection.linkingFrom) {
      if (node && node.id !== selection.linkingFrom) {
        const err = graphStore.linkNodes(selection.linkingFrom, node.id);
        if (err) selection.setStatus(err);
        else selection.cancelLinking();
      } else {
        selection.cancelLinking();
      }
      return;
    }

    if (node) {
      selection.select(node.id);
      return;
    }

    // Empty space: create a goal snapped to the current fine grid. Its world size
    // comes from the current zoom, so goals placed while zoomed in are smaller.
    const cam = this.cam;
    const world = screenToWorld({ x: sx, y: sy }, cam, this.vp);
    const pos = snapWorldToGrid(world, cam.zoom);
    const size = goalWorldRadius(cam.zoom);
    const id = graphStore.addGoal(pos, size);
    if (id) selection.select(id);
  }

  private redraw(): void {
    this.drawGrid();
    this.drawEdges();
    this.drawNodes();
  }

  private drawGrid(): void {
    const g = this.gridLayer;
    g.clear();
    const cam = this.cam;

    const fine = gridStepWorld(cam.zoom);
    const coarse = fine * GRID_SUBDIVISIONS;

    // Fine subdivisions (dim), then coarse cells (brighter) on top.
    this.drawGridLevel(g, fine);
    g.stroke({ width: 1, color: 0x1b1f29, alpha: 1 });
    this.drawGridLevel(g, coarse);
    g.stroke({ width: 1, color: 0x2c3342, alpha: 1 });
  }

  /** Draws vertical + horizontal lines at a given world-space step into `g`. */
  private drawGridLevel(g: Graphics, step: number): void {
    const cam = this.cam;
    const vp = this.vp;

    const topLeft = screenToWorld({ x: 0, y: 0 }, cam, vp);
    const bottomRight = screenToWorld({ x: vp.width, y: vp.height }, cam, vp);

    const startGx = Math.floor(topLeft.x / step) - 1;
    const endGx = Math.ceil(bottomRight.x / step) + 1;
    const startGy = Math.floor(topLeft.y / step) - 1;
    const endGy = Math.ceil(bottomRight.y / step) + 1;

    // Safety cap: never attempt to draw an absurd number of lines.
    if (endGx - startGx > 400 || endGy - startGy > 400) return;

    for (let gx = startGx; gx <= endGx; gx++) {
      const a = worldToScreen({ x: gx * step, y: startGy * step }, cam, vp);
      const b = worldToScreen({ x: gx * step, y: endGy * step }, cam, vp);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
    for (let gy = startGy; gy <= endGy; gy++) {
      const a = worldToScreen({ x: startGx * step, y: gy * step }, cam, vp);
      const b = worldToScreen({ x: endGx * step, y: gy * step }, cam, vp);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
  }

  private drawEdges(): void {
    const g = this.edgeLayer;
    g.clear();
    const { graph } = useGraphStore.getState();
    const cam = this.cam;
    const vp = this.vp;

    for (const edge of Object.values(graph.edges)) {
      const from = graph.nodes[edge.from];
      const to = graph.nodes[edge.to];
      if (!from || !to) continue;
      const p1 = worldToScreen(from.pos, cam, vp);
      const p2 = worldToScreen(to.pos, cam, vp);
      const r2 = Math.max(nodeScreenRadius(to, cam), 6);

      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      // Stop the line at the edge of the target node.
      const end = {
        x: p2.x - Math.cos(angle) * r2,
        y: p2.y - Math.sin(angle) * r2,
      };
      g.moveTo(p1.x, p1.y).lineTo(end.x, end.y);
      g.stroke({ width: 1.5, color: 0x5b6472, alpha: 0.9 });

      // Arrowhead.
      const ah = 9;
      g.moveTo(end.x, end.y)
        .lineTo(
          end.x - ah * Math.cos(angle - Math.PI / 7),
          end.y - ah * Math.sin(angle - Math.PI / 7),
        )
        .lineTo(
          end.x - ah * Math.cos(angle + Math.PI / 7),
          end.y - ah * Math.sin(angle + Math.PI / 7),
        )
        .lineTo(end.x, end.y)
        .fill({ color: 0x5b6472 });
    }
  }

  private drawNodes(): void {
    const layer = this.nodeLayer;
    layer.removeChildren().forEach((c) => c.destroy());

    const { graph } = useGraphStore.getState();
    const { selectedId, linkingFrom } = useSelectionStore.getState();
    const cam = this.cam;
    const vp = this.vp;

    for (const node of Object.values(graph.nodes)) {
      const p = worldToScreen(node.pos, cam, vp);
      const r = Math.max(nodeScreenRadius(node, cam), 2);

      const gfx = new Graphics();
      // Selection / linking ring.
      if (node.id === selectedId || node.id === linkingFrom) {
        gfx
          .circle(p.x, p.y, r + 5)
          .stroke({ width: 2, color: node.id === linkingFrom ? 0xffd166 : 0xffffff });
      }
      gfx.circle(p.x, p.y, r).fill({ color: hexToNumber(node.color) });
      if (node.kind === "start") {
        gfx.circle(p.x, p.y, r).stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
      }
      layer.addChild(gfx);

      // Level-of-detail: only label nodes that are big enough on screen.
      if (r >= 12) {
        const label = new Text({
          text: node.name,
          style: {
            fill: 0xe6e6e6,
            fontSize: 12,
            fontFamily: "system-ui, sans-serif",
          },
        });
        label.anchor.set(0.5, 0);
        label.x = p.x;
        label.y = p.y + r + 4;
        layer.addChild(label);
      }
    }
  }
}
