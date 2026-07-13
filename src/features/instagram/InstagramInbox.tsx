/** Instagram inbox: reel/post links shared via the Telegram bot, waiting to be
 *  turned into goals or traits. Its own mailbox, mirroring the Telegram inbox.
 *  Renders nothing unless there are pending items. */

import { useCallback, useEffect, useState } from "react";
import { api, type InstagramItem } from "../../api/client";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import { InstagramEmbed } from "./InstagramEmbed";
import type { Id } from "../../domain/types";

function firstLine(text: string | null): string {
  return (text ?? "").split("\n")[0]?.trim() ?? "";
}

function itemTitle(item: InstagramItem): string {
  const line = firstLine(item.text);
  if (line) return line.slice(0, 80);
  return item.mediaType === "post" ? "Instagram post" : "Instagram reel";
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function description(item: InstagramItem): string {
  const parts: string[] = [];
  if (item.text) parts.push(item.text);
  parts.push(item.url);
  if (item.date) parts.push(`— ${formatDate(item.date)}`);
  return parts.join("\n\n");
}

export function InstagramInbox() {
  const [items, setItems] = useState<InstagramItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);

  const addGoal = useGraphStore((s) => s.addGoal);
  const updateNode = useGraphStore((s) => s.updateNode);
  const addTraitDetailed = useGraphStore((s) => s.addTraitDetailed);
  const selectedId = useSelectionStore((s) => s.selectedId);
  const selectedName = useGraphStore((s) =>
    selectedId ? (s.graph.nodes[selectedId]?.name ?? null) : null,
  );

  const refresh = useCallback(async () => {
    try {
      const res = await api.instagramInbox();
      setItems(res.items);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 8000);
    return () => window.clearInterval(id);
  }, [refresh]);

  if (!items || items.length === 0) return null;

  const placeGoal = (): Id | null => {
    const graph = useGraphStore.getState().graph;
    const size =
      Object.values(graph.nodes).find((n) => n.kind === "start")?.size ?? 28;
    for (let i = 0; i < 60; i++) {
      const col = i % 6;
      const row = Math.floor(i / 6);
      const pos = { x: 260 + col * size * 3.2, y: -120 + row * size * 3.2 };
      const id = addGoal(pos, size);
      if (id) return id;
    }
    return null;
  };

  const toGoal = async (item: InstagramItem) => {
    setBusyId(item.id);
    try {
      const goalId = placeGoal();
      if (goalId) {
        updateNode(goalId, {
          name: itemTitle(item),
          description: description(item),
        });
      }
      await api.instagramInboxImport(item.id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const toTrait = async (item: InstagramItem) => {
    if (!selectedId) return;
    setBusyId(item.id);
    try {
      addTraitDetailed(selectedId, {
        name: itemTitle(item),
        description: description(item),
      });
      await api.instagramInboxImport(item.id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (item: InstagramItem) => {
    setBusyId(item.id);
    try {
      await api.instagramInboxDismiss(item.id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 font-medium text-neutral-200"
      >
        <span className="text-neutral-500">{open ? "▾" : "▸"}</span>
        📸 Instagram inbox
        <span className="rounded-full bg-pink-600/80 px-1.5 py-0.5 text-[10px] text-white">
          {items.length}
        </span>
      </button>

      {open && (
        <ul className="mt-2 flex flex-col gap-2">
          {items.map((item) => {
            const busy = busyId === item.id;
            return (
              <li
                key={item.id}
                className="rounded-md border border-neutral-800 bg-neutral-900 p-2"
              >
                <div className="flex gap-2">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-neutral-800 text-lg ring-1 ring-neutral-700">
                    {item.mediaType === "post" ? "🖼️" : "🎬"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] uppercase tracking-wide text-neutral-500">
                      Instagram {item.mediaType ?? "reel"}
                      {item.date ? ` · ${formatDate(item.date)}` : ""}
                    </p>
                    <p className="line-clamp-2 whitespace-pre-wrap break-words text-neutral-300">
                      {item.text || (
                        <span className="italic text-neutral-500">
                          (no note)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPreview(item.url)}
                    className="rounded bg-neutral-700 px-2 py-1 text-neutral-200 hover:bg-neutral-600"
                  >
                    ▶ Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => toGoal(item)}
                    disabled={busy}
                    className="rounded bg-sky-600 px-2 py-1 font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                  >
                    ＋ New goal
                  </button>
                  <button
                    type="button"
                    onClick={() => toTrait(item)}
                    disabled={busy || !selectedId}
                    title={
                      selectedId
                        ? `Add as a trait to ${selectedName}`
                        : "Select a goal first"
                    }
                    className="rounded bg-neutral-700 px-2 py-1 text-neutral-200 hover:bg-neutral-600 disabled:opacity-40"
                  >
                    → Trait{selectedName ? ` on ${selectedName}` : ""}
                  </button>
                  <button
                    type="button"
                    onClick={() => dismiss(item)}
                    disabled={busy}
                    className="ml-auto text-neutral-500 hover:text-red-400 disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
          onClick={() => setPreview(null)}
        >
          <div
            className="flex max-h-[86vh] w-[380px] max-w-full flex-col gap-3 overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <InstagramEmbed url={preview} />
            <div className="flex items-center justify-end gap-3">
              <a
                href={preview}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded bg-pink-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-500"
              >
                Open in Instagram
              </a>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded bg-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
