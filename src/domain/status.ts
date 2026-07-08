/** Goal status metadata: labels and colors. Pure. */

import type { GoalStatus, GraphNode } from "./types";

export const STATUS_ORDER: GoalStatus[] = ["next-up", "in-progress", "done"];

export const STATUS_LABELS: Record<GoalStatus, string> = {
  "next-up": "Next up",
  "in-progress": "In progress",
  done: "Done",
};

/** Hex color per status: grey / yellow / green. */
export const STATUS_HEX: Record<GoalStatus, string> = {
  "next-up": "#9ca3af",
  "in-progress": "#eab308",
  done: "#22c55e",
};

/** Status of a node, defaulting to "next-up" if unset (legacy data). */
export function nodeStatus(node: GraphNode): GoalStatus {
  return node.status ?? "next-up";
}
