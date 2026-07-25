/** Bridge letting React (HTML drag-and-drop) hit-test goal nodes on the Pixi
 *  canvas without holding a renderer reference. The renderer registers its
 *  hit-test on init and clears it on destroy. */

export type CanvasHitTest = (clientX: number, clientY: number) => string | null;
export type CanvasGoalCreator = (clientX: number, clientY: number) => string | null;

let hitTest: CanvasHitTest | null = null;
let goalCreator: CanvasGoalCreator | null = null;

export function setCanvasHitTest(fn: CanvasHitTest | null): void {
  hitTest = fn;
}

export function setCanvasGoalCreator(fn: CanvasGoalCreator | null): void {
  goalCreator = fn;
}

/** Return the id of the goal/node under a client-space point, or null. */
export function nodeIdAtClient(clientX: number, clientY: number): string | null {
  return hitTest ? hitTest(clientX, clientY) : null;
}

/** Create a new goal at a client-space point, returning its id (or null). */
export function createGoalAtClient(clientX: number, clientY: number): string | null {
  return goalCreator ? goalCreator(clientX, clientY) : null;
}
