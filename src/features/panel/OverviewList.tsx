/** Overview tree shown in the panel when nothing is selected.
 *  Lists the user (start) and top-level goals, expandable to reveal subgoals.
 *  Clicking an item selects it and centers the canvas on it. */

import { useState } from "react";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import { useCameraStore } from "../../state/cameraStore";
import { incomingNodes, outgoingNodes } from "../../domain/graph";
import { nodeStatus } from "../../domain/status";
import { linkify } from "../../lib/linkify";
import type { GraphNode, Id } from "../../domain/types";
import { StatusDot } from "./StatusDot";

export function OverviewList() {
  const graph = useGraphStore((s) => s.graph);
  const select = useSelectionStore((s) => s.select);
  const focusOn = useCameraStore((s) => s.focusOn);
  const [expanded, setExpanded] = useState<Set<Id>>(new Set());

  const nodes = Object.values(graph.nodes);
  const start = nodes.find((n) => n.kind === "start");
  // Top-level goals: goals that are not a subgoal of anything (no outgoing edge).
  const rootGoals = nodes.filter(
    (n) => n.kind === "goal" && outgoingNodes(graph, n.id).length === 0,
  );

  const toggle = (id: Id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const navigate = (node: GraphNode) => {
    select(node.id);
    focusOn(node.pos, node.size);
  };

  const renderItem = (node: GraphNode, depth: number) => {
    const children = incomingNodes(graph, node.id);
    const isOpen = expanded.has(node.id);
    return (
      <li key={node.id}>
        <div
          className="flex items-center gap-1 rounded hover:bg-neutral-800"
          style={{ paddingLeft: depth * 12 }}
        >
          {children.length > 0 ? (
            <button
              type="button"
              onClick={() => toggle(node.id)}
              className="flex h-5 w-5 shrink-0 items-center justify-center text-neutral-400 hover:text-white"
              aria-label={isOpen ? "Collapse" : "Expand"}
            >
              {isOpen ? "▾" : "▸"}
            </button>
          ) : (
            <span className="h-5 w-5 shrink-0" />
          )}
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate(node)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") navigate(node);
            }}
            className="flex flex-1 cursor-pointer items-center gap-2 py-1 pr-2 text-left text-sm"
          >
            <StatusDot node={node} />
            <span
              className={`truncate ${
                nodeStatus(node) === "done" ? "text-neutral-500 line-through" : ""
              }`}
            >
              {linkify(node.name)}
              {node.kind === "start" && (
                <span className="ml-1 text-xs text-neutral-500">(you)</span>
              )}
            </span>
          </div>
        </div>
        {isOpen && children.length > 0 && (
          <ul>{children.map((c) => renderItem(c, depth + 1))}</ul>
        )}
      </li>
    );
  };

  return (
    <div>
      <h2 className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
        Overview
      </h2>
      <ul>
        {start && renderItem(start, 0)}
        {rootGoals.map((g) => renderItem(g, 0))}
      </ul>
      {rootGoals.length === 0 && !start && (
        <p className="text-sm text-neutral-500">Nothing here yet.</p>
      )}
    </div>
  );
}
