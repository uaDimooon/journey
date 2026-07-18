/** Mounts the imperative PixiJS canvas into React, and accepts trait drops from
 *  the panel to reassign (move/copy) a trait onto whatever goal is under the
 *  cursor. */

import { useEffect, useRef, useState } from "react";
import { CanvasRenderer } from "../../render/CanvasRenderer";
import { nodeIdAtClient } from "../../render/canvasBridge";
import { useDragStore } from "../../state/dragStore";
import { useGraphStore } from "../../state/graphStore";
import { chooseCopyOrMove } from "../../state/chooseStore";
import { api } from "../../api/client";
import type { Trait, TraitAttachment } from "../../domain/types";

export function CanvasView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const traitDrag = useDragStore((s) => s.trait);
  const overGoalId = useDragStore((s) => s.overGoalId);
  const setOverGoal = useDragStore((s) => s.setOverGoal);
  const overGoalName = useGraphStore((s) =>
    overGoalId ? (s.graph.nodes[overGoalId]?.name ?? null) : null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new CanvasRenderer();
    let disposed = false;

    renderer
      .init(host)
      .then(() => {
        if (disposed) renderer.destroy();
      })
      .catch((err) => {
        console.error("Failed to init canvas renderer", err);
      });

    return () => {
      disposed = true;
      renderer.destroy();
    };
  }, []);

  const dropTrait = async (clientX: number, clientY: number) => {
    const drag = useDragStore.getState().trait;
    useDragStore.getState().endTrait();
    if (!drag) return;
    const toNodeId = nodeIdAtClient(clientX, clientY);
    if (!toNodeId || toNodeId === drag.fromNodeId) return;

    const graph = useGraphStore.getState().graph;
    const targetName = graph.nodes[toNodeId]?.name ?? "goal";
    const choice = await chooseCopyOrMove(
      `Move or copy "${drag.name}" to "${targetName}"?`,
    );
    if (!choice) return;

    const store = useGraphStore.getState();
    if (choice === "move") {
      store.moveTrait(drag.fromNodeId, drag.traitId, toNodeId);
      return;
    }
    // Copy: duplicate the trait with independent attachment/cover files.
    const source = graph.nodes[drag.fromNodeId]?.traits.find(
      (t: Trait) => t.id === drag.traitId,
    );
    if (!source) return;
    setBusy(true);
    try {
      const attachments: TraitAttachment[] = [];
      for (const a of source.attachments) {
        try {
          attachments.push(await api.duplicateAttachment(a.id));
        } catch {
          /* skip an attachment that fails to copy */
        }
      }
      let cover: TraitAttachment | null = null;
      if (source.cover) {
        const coverIdx = source.attachments.findIndex(
          (a) => a.id === source.cover!.id,
        );
        // If the cover was also an attachment, reuse its fresh copy; else copy it.
        cover =
          coverIdx >= 0
            ? attachments[coverIdx]
            : await api.duplicateAttachment(source.cover.id).catch(() => null);
      }
      store.addTraitDetailed(toNodeId, {
        name: source.name,
        description: source.description,
        attachments,
        cover,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={hostRef}
      className="relative h-full w-full"
      onDragOver={(e) => {
        if (!useDragStore.getState().trait) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOverGoal(nodeIdAtClient(e.clientX, e.clientY));
      }}
      onDragLeave={(e) => {
        // Only clear when actually leaving the canvas area.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverGoal(null);
      }}
      onDrop={(e) => {
        if (!useDragStore.getState().trait) return;
        e.preventDefault();
        void dropTrait(e.clientX, e.clientY);
      }}
    >
      {traitDrag && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full bg-neutral-900/90 px-3 py-1.5 text-xs text-neutral-200 shadow-lg ring-1 ring-neutral-700">
          {overGoalName
            ? `Drop to reassign "${traitDrag.name}" → ${overGoalName}`
            : `Drag "${traitDrag.name}" onto a goal to reassign it`}
        </div>
      )}
      {busy && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full bg-neutral-900/90 px-3 py-1.5 text-xs text-sky-300 shadow-lg ring-1 ring-neutral-700">
          Copying trait…
        </div>
      )}
    </div>
  );
}
