/** Telegram inbox: forwarded messages/media waiting to be turned into goals or
 *  traits. Renders nothing unless connected and there are pending items. */

import { useCallback, useEffect, useState } from "react";
import { api, type InboxItem } from "../../api/client";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import type { Id } from "../../domain/types";

const KIND_ICON: Record<string, string> = {
  image: "🖼️",
  video: "🎬",
  audio: "🎧",
  file: "📎",
};

function firstLine(text: string | null): string {
  return (text ?? "").split("\n")[0]?.trim() ?? "";
}

function itemTitle(item: InboxItem): string {
  const line = firstLine(item.text);
  if (line) return line.slice(0, 80);
  if (item.attachments.length) return item.attachments[0].name;
  return item.source ? `From ${item.source}` : "Telegram item";
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// A "— source · date" line capturing where/when the item came from.
function provenance(item: InboxItem): string {
  const parts = [item.source, item.date ? formatDate(item.date) : null].filter(
    Boolean,
  );
  return parts.length ? `— ${parts.join(" · ")}` : "";
}

// The item's text with the provenance line appended, for goal/trait descriptions.
function descWithProvenance(item: InboxItem): string {
  const p = provenance(item);
  const body = item.text ?? "";
  if (!p) return body;
  return body ? `${body}\n\n${p}` : p;
}

// Map an item's attachments onto trait fields: a single image becomes the
// cover; multiple files are all attached (with the first image as a cover tile).
function traitMediaProps(item: InboxItem): {
  cover?: { id: string; name: string; type: string };
  attachments?: { id: string; name: string; type: string }[];
} {
  const atts = item.attachments.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
  }));
  if (atts.length === 0) return {};
  const images = atts.filter((a) => a.type.startsWith("image/"));
  if (atts.length === 1) {
    return images.length === 1 ? { cover: images[0] } : { attachments: atts };
  }
  return { attachments: atts, ...(images.length ? { cover: images[0] } : {}) };
}

export function TelegramInbox() {
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const addGoal = useGraphStore((s) => s.addGoal);
  const updateNode = useGraphStore((s) => s.updateNode);
  const addTraitDetailed = useGraphStore((s) => s.addTraitDetailed);
  const selectedId = useSelectionStore((s) => s.selectedId);
  const selectedName = useGraphStore((s) =>
    selectedId ? (s.graph.nodes[selectedId]?.name ?? null) : null,
  );

  const refresh = useCallback(async () => {
    try {
      const res = await api.telegramInbox();
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

  const toGoal = async (item: InboxItem) => {
    setBusyId(item.id);
    try {
      const goalId = placeGoal();
      if (goalId) {
        updateNode(goalId, {
          name: itemTitle(item),
          description: descWithProvenance(item),
        });
        if (item.attachments.length) {
          addTraitDetailed(goalId, {
            name: itemTitle(item),
            ...traitMediaProps(item),
          });
        }
      }
      await api.telegramInboxImport(item.id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const toTrait = async (item: InboxItem) => {
    if (!selectedId) return;
    setBusyId(item.id);
    try {
      addTraitDetailed(selectedId, {
        name: itemTitle(item),
        description: descWithProvenance(item),
        ...traitMediaProps(item),
      });
      await api.telegramInboxImport(item.id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (item: InboxItem) => {
    setBusyId(item.id);
    try {
      await api.telegramInboxDismiss(item.id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-xs">
      <div className="mb-2 font-medium text-neutral-200">
        📥 Telegram inbox
        <span className="ml-1.5 rounded-full bg-sky-600/80 px-1.5 py-0.5 text-[10px] text-white">
          {items.length}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const firstImage = item.attachments.find((a) =>
            a.type.startsWith("image/"),
          );
          const extra = item.attachments.length - 1;
          const busy = busyId === item.id;
          return (
            <li
              key={item.id}
              className="rounded-md border border-neutral-800 bg-neutral-900 p-2"
            >
              <div className="flex gap-2">
                {firstImage ? (
                  <div className="relative h-12 w-12 shrink-0">
                    <img
                      src={api.attachmentUrl(firstImage.id)}
                      alt=""
                      className="h-12 w-12 rounded object-cover ring-1 ring-neutral-700"
                    />
                    {extra > 0 && (
                      <span className="absolute -bottom-1 -right-1 rounded-full bg-sky-600 px-1 text-[9px] font-medium text-white">
                        +{extra}
                      </span>
                    )}
                  </div>
                ) : item.mediaKind ? (
                  <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded bg-neutral-800 text-lg ring-1 ring-neutral-700">
                    {KIND_ICON[item.mediaKind] ?? "📎"}
                    {extra > 0 && (
                      <span className="absolute -bottom-1 -right-1 rounded-full bg-sky-600 px-1 text-[9px] font-medium text-white">
                        +{extra}
                      </span>
                    )}
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  {(item.source || item.date) && (
                    <p className="truncate text-[10px] uppercase tracking-wide text-neutral-500">
                      {item.source}
                      {item.source && item.date ? " · " : ""}
                      {item.date ? formatDate(item.date) : ""}
                    </p>
                  )}
                  <p className="line-clamp-3 whitespace-pre-wrap break-words text-neutral-300">
                    {item.text || (
                      <span className="italic text-neutral-500">
                        {item.attachments.length > 1
                          ? `${item.attachments.length} attachments`
                          : (item.attachments[0]?.name ?? "(no text)")}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
    </div>
  );
}
