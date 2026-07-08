/** Left detail panel: binds to the selected node and the graph. */

import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import { useAuthStore } from "../../state/authStore";
import { incomingNodes } from "../../domain/graph";
import { STATUS_HEX, STATUS_LABELS, STATUS_ORDER, nodeStatus } from "../../domain/status";
import { linkify } from "../../lib/linkify";
import { TraitEditor } from "../traits/TraitEditor";
import { OverviewList } from "./OverviewList";
import { StatusDot } from "./StatusDot";

export function DetailPanel() {
  const graph = useGraphStore((s) => s.graph);
  const updateNode = useGraphStore((s) => s.updateNode);
  const removeNode = useGraphStore((s) => s.removeNode);

  const selectedId = useSelectionStore((s) => s.selectedId);
  const linkingFrom = useSelectionStore((s) => s.linkingFrom);
  const status = useSelectionStore((s) => s.status);
  const startLinking = useSelectionStore((s) => s.startLinking);
  const cancelLinking = useSelectionStore((s) => s.cancelLinking);
  const select = useSelectionStore((s) => s.select);

  const node = selectedId ? graph.nodes[selectedId] : null;
  const subgoals = node ? incomingNodes(graph, node.id) : [];

  const userEmail = useAuthStore((s) => s.user?.email);
  const logout = useAuthStore((s) => s.logout);

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-neutral-800 bg-neutral-900 p-4">
      <header>
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-lg font-semibold text-white">Journey</h1>
          <div className="text-right">
            {userEmail && (
              <p className="max-w-[9rem] truncate text-xs text-neutral-400">
                {userEmail}
              </p>
            )}
            <button
              type="button"
              onClick={() => logout()}
              className="text-xs text-neutral-500 hover:text-white"
            >
              Log out
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-neutral-400">
          Click the grid to add a goal. Click a node to select it.
        </p>
      </header>

      {status && (
        <div className="rounded bg-amber-500/15 px-3 py-2 text-xs text-amber-300">
          {status}
        </div>
      )}

      {!node && <OverviewList />}

      {node && (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => select(null)}
            className="self-start text-xs text-neutral-400 hover:text-white"
          >
            ← All items
          </button>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">
              Name
            </label>
            <input
              value={node.name}
              onChange={(e) => updateNode(node.id, { name: e.target.value })}
              className="w-full rounded bg-neutral-800 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {node.kind === "goal" && (
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">
                Status
              </label>
              <div className="flex gap-1">
                {STATUS_ORDER.map((s) => {
                  const active = nodeStatus(node) === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => updateNode(node.id, { status: s })}
                      className="flex-1 rounded px-2 py-1 text-xs font-medium transition-colors"
                      style={
                        active
                          ? { background: STATUS_HEX[s], color: "#0f1115" }
                          : { background: "#262626", color: "#a3a3a3" }
                      }
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">
              Description
            </label>
            <textarea
              value={node.description}
              onChange={(e) =>
                updateNode(node.id, { description: e.target.value })
              }
              rows={4}
              className="w-full resize-none rounded bg-neutral-800 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {node.kind === "goal" && (
            <div className="flex items-center gap-3">
              <label className="text-xs uppercase tracking-wide text-neutral-500">
                Color
              </label>
              <input
                type="color"
                value={node.color}
                onChange={(e) => updateNode(node.id, { color: e.target.value })}
                className="h-8 w-12 cursor-pointer rounded bg-transparent"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">
              Traits
            </label>
            <TraitEditor nodeId={node.id} traits={node.traits} />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">
              Subgoals ({subgoals.length})
            </label>
            {subgoals.length === 0 ? (
              <p className="text-xs text-neutral-500">
                No incoming subgoals yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {subgoals.map((s) => (
                  <li key={s.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => select(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") select(s.id);
                      }}
                      className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-neutral-800"
                    >
                      <StatusDot node={s} />
                      <span
                        className={
                          nodeStatus(s) === "done"
                            ? "text-neutral-500 line-through"
                            : ""
                        }
                      >
                        {linkify(s.name)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-2 flex flex-col gap-2">
            {linkingFrom === node.id ? (
              <button
                type="button"
                onClick={cancelLinking}
                className="rounded bg-amber-600 px-3 py-2 text-sm hover:bg-amber-500"
              >
                Cancel linking…
              </button>
            ) : (
              <button
                type="button"
                onClick={() => startLinking(node.id)}
                className="rounded bg-sky-600 px-3 py-2 text-sm hover:bg-sky-500"
              >
                Link this → another goal
              </button>
            )}

            {node.kind === "goal" && (
              <button
                type="button"
                onClick={() => {
                  removeNode(node.id);
                  select(null);
                }}
                className="rounded bg-neutral-800 px-3 py-2 text-sm text-red-400 hover:bg-neutral-700"
              >
                Delete goal
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
