/** Bridge letting React (HTML drag-and-drop) hit-test goal nodes on the Pixi
 *  canvas without holding a renderer reference. The renderer registers its
 *  hit-test on init and clears it on destroy. */

export type CanvasHitTest = (clientX: number, clientY: number) => string | null;

let hitTest: CanvasHitTest | null = null;

export function setCanvasHitTest(fn: CanvasHitTest | null): void {
  hitTest = fn;
}

/** Return the id of the goal/node under a client-space point, or null. */
export function nodeIdAtClient(clientX: number, clientY: number): string | null {
  return hitTest ? hitTest(clientX, clientY) : null;
}
