/** Cover image for a goal, mirroring the trait-cover UX: set from a file,
 *  drag-and-drop or paste an image, or reuse any image attached anywhere in the
 *  goal's traits. The cover is rendered clipped inside the goal's circle. */

import { useState } from "react";
import { useGraphStore } from "../../state/graphStore";
import { api, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_MB } from "../../api/client";
import type { GraphNode, Id, TraitAttachment } from "../../domain/types";

// Every distinct image attached anywhere in the goal's traits (attachments +
// trait covers), so the user can reuse one as the goal cover without re-upload.
function goalImagePool(node: GraphNode): TraitAttachment[] {
  const seen = new Set<string>();
  const out: TraitAttachment[] = [];
  const add = (a?: TraitAttachment | null) => {
    if (a && a.type.startsWith("image/") && !seen.has(a.id)) {
      seen.add(a.id);
      out.push(a);
    }
  };
  for (const t of node.traits) {
    add(t.cover);
    for (const a of t.attachments) add(a);
  }
  return out;
}

export function GoalCover({ node }: { node: GraphNode }) {
  const updateNode = useGraphStore((s) => s.updateNode);
  const [busy, setBusy] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cover = node.cover ?? null;
  const pool = goalImagePool(node);
  const poolIds = pool.map((a) => a.id);

  const setCover = (c: TraitAttachment | null) => updateNode(node.id, { cover: c });

  // Drop the previous cover file only if it isn't referenced elsewhere in the goal.
  const cleanupPrevious = (previousId?: Id) => {
    if (previousId && previousId !== cover?.id && !poolIds.includes(previousId)) {
      api.deleteAttachment(previousId).catch(() => {});
    }
  };

  const setCoverFromFile = async (file: File, previousId?: Id) => {
    if (!file.type.startsWith("image/")) {
      setError("A cover must be an image.");
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(`"${file.name}" is too large (max ${MAX_ATTACHMENT_MB} MB).`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const att = await api.uploadAttachment(file);
      setCover(att);
      cleanupPrevious(previousId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setCoverFromAttachment = (att: TraitAttachment) => {
    const previousId = cover?.id;
    setCover({ id: att.id, name: att.name, type: att.type });
    // Only delete the old cover if it was a standalone upload (not in the pool).
    if (previousId && previousId !== att.id && !poolIds.includes(previousId)) {
      api.deleteAttachment(previousId).catch(() => {});
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    const file = Array.from(e.dataTransfer?.files ?? []).find((f) =>
      f.type.startsWith("image/"),
    );
    if (!file) return;
    e.preventDefault();
    e.stopPropagation();
    setDropActive(false);
    await setCoverFromFile(file, cover?.id);
  };

  const onPaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (!file) continue;
        const ext = (file.type.split("/")[1] || "png").split("+")[0];
        const named =
          file.name && file.name !== "image.png"
            ? file
            : new File([file], `cover-${Date.now()}.${ext}`, { type: file.type });
        e.preventDefault();
        await setCoverFromFile(named, cover?.id);
        return;
      }
    }
  };

  const removeCover = () => {
    const id = cover?.id;
    setCover(null);
    if (id && !poolIds.includes(id)) api.deleteAttachment(id).catch(() => {});
  };

  return (
    <div>
      <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">
        Cover
      </label>
      <div
        className={`flex flex-col gap-2 rounded p-1 ${
          dropActive ? "ring-2 ring-sky-400" : ""
        }`}
        tabIndex={0}
        onPaste={onPaste}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.types).includes("Files")) {
            e.preventDefault();
            setDropActive(true);
          }
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={onDrop}
      >
        <div className="flex items-center gap-2">
          {cover ? (
            <>
              <img
                src={api.attachmentUrl(cover.id)}
                alt=""
                className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-neutral-700"
              />
              <label className="inline-flex cursor-pointer items-center gap-1 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700">
                {busy ? "Updating…" : "Replace"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setCoverFromFile(f, cover.id);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                onClick={removeCover}
                className="text-xs text-neutral-400 hover:text-red-400"
              >
                Remove
              </button>
            </>
          ) : (
            <label className="inline-flex cursor-pointer items-center gap-1 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700">
              {busy ? "Uploading…" : "🖼️ Set cover image"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setCoverFromFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>

        {!cover && (
          <p className="text-[11px] text-neutral-500">
            Drop or paste an image here, upload a file, or pick one below.
          </p>
        )}

        {pool.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-neutral-500">Use attached:</span>
            {pool.map((a) => {
              const isCover = cover?.id === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setCoverFromAttachment(a)}
                  title={isCover ? "Current cover" : `Use ${a.name} as cover`}
                  className={`h-9 w-9 overflow-hidden rounded-full ring-1 ${
                    isCover
                      ? "ring-2 ring-sky-400"
                      : "ring-neutral-700 hover:ring-sky-500"
                  }`}
                >
                  <img
                    src={api.attachmentUrl(a.id)}
                    alt={a.name}
                    className="h-full w-full object-cover"
                  />
                </button>
              );
            })}
          </div>
        )}

        {error && <p className="text-[11px] text-red-400">{error}</p>}
      </div>
    </div>
  );
}
