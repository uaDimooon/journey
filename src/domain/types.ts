/** Pure domain types. No React, Pixi, or store imports allowed here. */

export type Id = string;

export interface Vec2 {
  x: number;
  y: number;
}

export type NodeKind = "start" | "goal";

/** Progress state of a goal. */
export type GoalStatus = "next-up" | "in-progress" | "done";

export interface GraphNode {
  id: Id;
  kind: NodeKind;
  name: string;
  description: string;
  color: string;
  traits: string[];
  /** Progress status. Defaults to "next-up" for new goals. */
  status: GoalStatus;
  /** World-space position (canvas coordinates). */
  pos: Vec2;
  /** World-space radius. Derived from the zoom level at placement time. */
  size: number;
}

/** One-directional connection: `from` (subgoal) feeds into `to` (goal). */
export interface Edge {
  id: Id;
  from: Id;
  to: Id;
}

export interface Graph {
  nodes: Record<Id, GraphNode>;
  edges: Record<Id, Edge>;
}
