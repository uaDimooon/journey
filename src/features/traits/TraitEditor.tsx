/** Trait editor: add, rename, describe, check off, reorder, and remove.
 *  Clicking a trait opens its description editor. */

import { useEffect, useState } from "react";
import { useGraphStore } from "../../state/graphStore";
import { useDragStore } from "../../state/dragStore";
import { chooseCopyOrMove } from "../../state/chooseStore";
import { api, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_MB } from "../../api/client";
import { linkify } from "../../lib/linkify";
import { PdfViewer } from "./PdfViewer";
import { InstagramEmbed } from "../instagram/InstagramEmbed";
import type { Id, Trait } from "../../domain/types";

// Find the first previewable (Instagram or YouTube) link in text.
type EmbedPreview =
  | { kind: "instagram"; url: string }
  | { kind: "youtube"; url: string; videoId: string };
function extractPreview(text: string): EmbedPreview | null {
  const ig = (text || "").match(
    /https?:\/\/(?:www\.)?instagram\.com\/(reels?|p|tv)\/([A-Za-z0-9_-]+)/i,
  );
  if (ig) {
    const path = ig[1].toLowerCase() === "p" ? "p" : "reel";
    return { kind: "instagram", url: `https://www.instagram.com/${path}/${ig[2]}/` };
  }
  const yt = (text || "").match(
    /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i,
  );
  if (yt) {
    return {
      kind: "youtube",
      url: `https://www.youtube.com/watch?v=${yt[1]}`,
      videoId: yt[1],
    };
  }
  return null;
}

export function TraitEditor({ nodeId, traits }: { nodeId: Id; traits: Trait[] }) {
  const [value, setValue] = useState("");
  const [editingId, setEditingId] = useState<Id | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [openId, setOpenId] = useState<Id | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [uploadingId, setUploadingId] = useState<Id | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dropTraitId, setDropTraitId] = useState<Id | null>(null);
  const [coverDropId, setCoverDropId] = useState<Id | null>(null);
  const [coverBusyId, setCoverBusyId] = useState<Id | null>(null);
  // Dragging an attachment from one trait onto another (move/copy).
  const [attachDrag, setAttachDrag] = useState<{
    fromTraitId: Id;
    attachmentId: Id;
    name: string;
  } | null>(null);
  const [attachDropId, setAttachDropId] = useState<Id | null>(null);
  const [attachBusy, setAttachBusy] = useState(false);
  const [preview, setPreview] = useState<{
    items: { id: string; name: string; type: string }[];
    index: number;
  } | null>(null);
  const [embedPreview, setEmbedPreview] = useState<EmbedPreview | null>(null);

  const previewItem = preview ? preview.items[preview.index] : null;
  const stepPreview = (delta: number) =>
    setPreview((p) =>
      p
        ? { ...p, index: (p.index + delta + p.items.length) % p.items.length }
        : p,
    );
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null);
      else if (e.key === "ArrowRight") stepPreview(1);
      else if (e.key === "ArrowLeft") stepPreview(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  const addTrait = useGraphStore((s) => s.addTrait);
  const removeTrait = useGraphStore((s) => s.removeTrait);
  const renameTrait = useGraphStore((s) => s.renameTrait);
  const setTraitDescription = useGraphStore((s) => s.setTraitDescription);
  const addTraitAttachment = useGraphStore((s) => s.addTraitAttachment);
  const removeTraitAttachment = useGraphStore((s) => s.removeTraitAttachment);
  const setTraitCover = useGraphStore((s) => s.setTraitCover);
  const toggleTrait = useGraphStore((s) => s.toggleTrait);
  const reorderTraits = useGraphStore((s) => s.reorderTraits);
  const moveAttachment = useGraphStore((s) => s.moveAttachment);
  const startTraitDrag = useDragStore((s) => s.startTrait);
  const endTraitDrag = useDragStore((s) => s.endTrait);

  const submit = () => {
    const t = value.trim();
    if (!t) return;
    addTrait(nodeId, t);
    setValue("");
  };

  const startEdit = (trait: Trait) => {
    setEditingId(trait.id);
    setEditDraft(trait.name);
  };

  const commitEdit = () => {
    if (editingId && editDraft.trim()) renameTrait(nodeId, editingId, editDraft);
    setEditingId(null);
  };

  const onUpload = async (traitId: Id, files: FileList | null) => {
    if (!files) return;
    await uploadFiles(traitId, Array.from(files));
  };

  const uploadFiles = async (traitId: Id, files: File[]) => {
    if (files.length === 0) return;
    setUploadError(null);
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setUploadError(`"${file.name}" is too large (max ${MAX_ATTACHMENT_MB} MB).`);
        continue;
      }
      setUploadingId(traitId);
      setUploadProgress(0);
      try {
        const att = await api.uploadAttachment(file, setUploadProgress);
        addTraitAttachment(nodeId, traitId, att);
      } catch (err) {
        setUploadError((err as Error).message);
      }
    }
    setUploadingId(null);
  };

  // Paste a screenshot / image from the clipboard to attach it.
  const onPaste = async (traitId: Id, e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const images: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          const ext = (file.type.split("/")[1] || "png").split("+")[0];
          const named =
            file.name && file.name !== "image.png"
              ? file
              : new File([file], `screenshot-${Date.now()}.${ext}`, {
                  type: file.type,
                });
          images.push(named);
        }
      }
    }
    if (images.length > 0) {
      e.preventDefault();
      await uploadFiles(traitId, images);
    }
  };

  const onDrop = async (traitId: Id, e: React.DragEvent) => {
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      setDropTraitId(null);
      await uploadFiles(traitId, Array.from(files));
    }
  };

  const onRemoveAttachment = async (traitId: Id, attachmentId: Id) => {
    removeTraitAttachment(nodeId, traitId, attachmentId);
    api.deleteAttachment(attachmentId).catch(() => {
      // best-effort server cleanup
    });
  };

  // Drop an attachment dragged from another trait onto this one (move/copy).
  const handleAttachmentDrop = async (toTraitId: Id) => {
    const drag = attachDrag;
    setAttachDrag(null);
    setAttachDropId(null);
    if (!drag || drag.fromTraitId === toTraitId) return;
    const source = traits.find((t) => t.id === drag.fromTraitId);
    const att = source?.attachments.find((a) => a.id === drag.attachmentId);
    if (!att) return;
    const choice = await chooseCopyOrMove(
      `Move or copy "${att.name}" to this trait?`,
    );
    if (!choice) return;
    if (choice === "move") {
      moveAttachment(nodeId, drag.fromTraitId, nodeId, toTraitId, drag.attachmentId);
      return;
    }
    setAttachBusy(true);
    try {
      const dup = await api.duplicateAttachment(att.id);
      addTraitAttachment(nodeId, toTraitId, dup);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setAttachBusy(false);
    }
  };

  // Upload an image and set it as the trait's square cover. Replacing an
  // existing cover deletes the old file on the server.
  const setCoverFromFile = async (
    traitId: Id,
    file: File,
    previousId?: Id,
  ) => {
    if (!file.type.startsWith("image/")) {
      setUploadError("A cover must be an image.");
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setUploadError(`"${file.name}" is too large (max ${MAX_ATTACHMENT_MB} MB).`);
      return;
    }
    setUploadError(null);
    setCoverBusyId(traitId);
    try {
      const att = await api.uploadAttachment(file);
      setTraitCover(nodeId, traitId, att);
      if (previousId) api.deleteAttachment(previousId).catch(() => {});
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setCoverBusyId(null);
    }
  };

  // Drop an image onto a trait's name to assign it as the cover.
  const onDropCover = async (
    traitId: Id,
    previousId: Id | undefined,
    e: React.DragEvent,
  ) => {
    const file = Array.from(e.dataTransfer?.files ?? []).find((f) =>
      f.type.startsWith("image/"),
    );
    if (!file) return;
    e.preventDefault();
    e.stopPropagation();
    setCoverDropId(null);
    await setCoverFromFile(traitId, file, previousId);
  };

  const onRemoveCover = (traitId: Id, coverId: Id) => {
    setTraitCover(nodeId, traitId, null);
    api.deleteAttachment(coverId).catch(() => {});
  };

  // Reuse an already-attached image as the cover (no re-upload). Cleans up the
  // previous cover only if it was a standalone cover (not one of the attachments).
  const setCoverFromAttachment = (
    traitId: Id,
    att: { id: string; name: string; type: string },
    previousCoverId: Id | undefined,
    attachmentIds: Id[],
  ) => {
    setTraitCover(nodeId, traitId, {
      id: att.id,
      name: att.name,
      type: att.type,
    });
    if (
      previousCoverId &&
      previousCoverId !== att.id &&
      !attachmentIds.includes(previousCoverId)
    ) {
      api.deleteAttachment(previousCoverId).catch(() => {});
    }
  };

  // Paste an image from the clipboard onto a focused trait to set/replace its
  // cover. (The trait's header receives the paste once it has focus.)
  const onPasteCover = async (
    traitId: Id,
    previousId: Id | undefined,
    e: React.ClipboardEvent,
  ) => {
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
            : new File([file], `cover-${Date.now()}.${ext}`, {
                type: file.type,
              });
        e.preventDefault();
        await setCoverFromFile(traitId, named, previousId);
        return;
      }
    }
  };

  return (
    <div>
      <ul className="mb-2 flex flex-col gap-1">
        {traits.length === 0 && (
          <li className="text-xs text-neutral-500">No traits yet.</li>
        )}
        {traits.map((t, index) => {
          const isOpen = openId === t.id;
          const embed = extractPreview(t.description);
          const controlButtons = (
            <>
              <button
                type="button"
                onClick={() => startEdit(t)}
                className="px-0.5 text-neutral-400 hover:text-white"
                aria-label={`Rename ${t.name}`}
                title="Rename"
              >
                ✎
              </button>
              <button
                type="button"
                onClick={() => reorderTraits(nodeId, index, index - 1)}
                disabled={index === 0}
                className="px-0.5 text-neutral-400 hover:text-white disabled:opacity-30"
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => reorderTraits(nodeId, index, index + 1)}
                disabled={index === traits.length - 1}
                className="px-0.5 text-neutral-400 hover:text-white disabled:opacity-30"
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeTrait(nodeId, t.id)}
                className="px-0.5 text-neutral-400 hover:text-white"
                aria-label={`Remove ${t.name}`}
              >
                ×
              </button>
            </>
          );
          return (
            <li
              key={t.id}
              draggable={editingId === null && !isOpen}
              onDragStart={(e) => {
                setDragIndex(index);
                startTraitDrag({ fromNodeId: nodeId, traitId: t.id, name: t.name });
                e.dataTransfer.effectAllowed = "copyMove";
              }}
              onDragEnd={() => {
                setDragIndex(null);
                endTraitDrag();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (attachDrag && attachDrag.fromTraitId !== t.id) {
                  setAttachDropId(t.id);
                }
              }}
              onDragLeave={() => {
                if (attachDrag) setAttachDropId((cur) => (cur === t.id ? null : cur));
              }}
              onDrop={() => {
                if (attachDrag) {
                  void handleAttachmentDrop(t.id);
                } else if (dragIndex !== null) {
                  reorderTraits(nodeId, dragIndex, index);
                }
                setDragIndex(null);
              }}
              className={`rounded ${dragIndex === index ? "opacity-50" : ""} ${
                attachDropId === t.id ? "ring-2 ring-emerald-400" : ""
              }`}
            >
              {editingId === t.id && t.cover ? (
                // Editing a trait that has a cover: keep the cover visible and
                // overlay the title input so it doesn't disappear.
                <div
                  className="group relative aspect-square w-full overflow-hidden rounded-lg ring-2 ring-sky-400"
                  onPaste={(e) => onPasteCover(t.id, t.cover?.id, e)}
                >
                  <img
                    src={api.attachmentUrl(t.cover.id)}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/5" />
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => toggleTrait(nodeId, t.id)}
                    className="absolute left-2 top-2 z-20 h-4 w-4 cursor-pointer accent-sky-500"
                    aria-label={`Mark ${t.name} done`}
                  />
                  <div className="absolute inset-x-0 bottom-0 z-10 p-2.5">
                    <input
                      autoFocus
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="w-full rounded bg-black/60 px-2 py-1 text-sm font-semibold text-white outline-none ring-1 ring-white/30 backdrop-blur-sm focus:ring-2 focus:ring-sky-400"
                    />
                  </div>
                </div>
              ) : editingId === t.id ? (
                <div
                  className="flex items-center gap-1.5 rounded px-1 py-0.5 text-xs"
                  onPaste={(e) => onPasteCover(t.id, t.cover?.id, e)}
                >
                  <span className="select-none text-neutral-600">⠿</span>
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => toggleTrait(nodeId, t.id)}
                    className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-sky-500"
                    aria-label={`Mark ${t.name} done`}
                  />
                  <input
                    autoFocus
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="min-w-0 flex-1 rounded bg-neutral-900 px-1 py-0.5 outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              ) : t.cover ? (
                <div
                  className={`group relative aspect-square w-full overflow-hidden rounded-lg ring-1 transition ${
                    coverDropId === t.id
                      ? "ring-2 ring-sky-400"
                      : "ring-neutral-700"
                  } ${t.done ? "opacity-60" : ""}`}
                  onDragOver={(e) => {
                    if (Array.from(e.dataTransfer.types).includes("Files")) {
                      e.preventDefault();
                      setCoverDropId(t.id);
                    }
                  }}
                  onDragLeave={() => setCoverDropId(null)}
                  onDrop={(e) => onDropCover(t.id, t.cover?.id, e)}
                  onPaste={(e) => onPasteCover(t.id, t.cover?.id, e)}
                  tabIndex={0}
                >
                  <img
                    src={api.attachmentUrl(t.cover.id)}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/5" />
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : t.id)}
                    aria-expanded={isOpen}
                    aria-label={`Open ${t.name}`}
                    className="absolute inset-0 z-0 cursor-pointer"
                  />
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => toggleTrait(nodeId, t.id)}
                    className="absolute left-2 top-2 z-20 h-4 w-4 cursor-pointer accent-sky-500"
                    aria-label={`Mark ${t.name} done`}
                  />
                  <div className="absolute right-1 top-1 z-20 flex items-center rounded-md bg-black/50 opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
                    {controlButtons}
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-2.5 [&_a]:pointer-events-auto">
                    <span
                      className={`text-sm font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] ${
                        t.done ? "line-through opacity-80" : ""
                      }`}
                    >
                      {linkify(t.name)}
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  className={`group flex items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-neutral-800 ${
                    coverDropId === t.id ? "ring-2 ring-sky-400" : ""
                  }`}
                  onDragOver={(e) => {
                    if (Array.from(e.dataTransfer.types).includes("Files")) {
                      e.preventDefault();
                      setCoverDropId(t.id);
                    }
                  }}
                  onDragLeave={() => setCoverDropId(null)}
                  onDrop={(e) => onDropCover(t.id, undefined, e)}
                  onPaste={(e) => onPasteCover(t.id, undefined, e)}
                >
                  <span
                    className="cursor-grab select-none text-neutral-600"
                    title="Drag to reorder"
                  >
                    ⠿
                  </span>
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => toggleTrait(nodeId, t.id)}
                    className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-sky-500"
                    aria-label={`Mark ${t.name} done`}
                  />
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : t.id)}
                    title="Click to open description"
                    aria-expanded={isOpen}
                    className={`flex min-w-0 flex-1 items-center gap-1 truncate text-left ${
                      t.done ? "text-neutral-500 line-through" : ""
                    }`}
                  >
                    <span className="shrink-0 text-neutral-600">
                      {isOpen ? "▾" : "▸"}
                    </span>
                    {linkify(t.name)}
                  </button>
                  <div className="flex items-center opacity-0 group-hover:opacity-100">
                    {controlButtons}
                  </div>
                </div>
              )}

              {isOpen && (
                <div
                  className={`mb-1 mt-1 flex flex-col gap-2 rounded pl-6 pr-1 ${
                    dropTraitId === t.id ? "ring-2 ring-sky-500" : ""
                  }`}
                  onPaste={(e) => onPaste(t.id, e)}
                  onDragOver={(e) => {
                    if (Array.from(e.dataTransfer.types).includes("Files")) {
                      e.preventDefault();
                      setDropTraitId(t.id);
                    }
                  }}
                  onDragLeave={() => setDropTraitId(null)}
                  onDrop={(e) => onDrop(t.id, e)}
                >
                  <textarea
                    autoFocus
                    value={t.description}
                    onChange={(e) =>
                      setTraitDescription(nodeId, t.id, e.target.value)
                    }
                    placeholder="Add a description… (paste ⌘V or drop files to attach)"
                    rows={3}
                    className="w-full resize-none rounded bg-neutral-900 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-sky-500"
                  />

                  {embed && (
                    <button
                      type="button"
                      onClick={() => setEmbedPreview(embed)}
                      className="inline-flex w-fit items-center gap-1 rounded bg-neutral-800 px-2 py-1 text-xs text-pink-300 hover:bg-neutral-700"
                    >
                      ▶ Preview {embed.kind === "youtube" ? "YouTube" : "Instagram"}
                    </button>
                  )}

                  {/* Cover image */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      {t.cover ? (
                        <>
                          <img
                            src={api.attachmentUrl(t.cover.id)}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded object-cover ring-1 ring-neutral-700"
                          />
                          <label className="inline-flex cursor-pointer items-center gap-1 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700">
                            {coverBusyId === t.id ? "Updating…" : "Replace cover"}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) setCoverFromFile(t.id, f, t.cover?.id);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => onRemoveCover(t.id, t.cover!.id)}
                            className="text-xs text-neutral-400 hover:text-red-400"
                          >
                            Remove cover
                          </button>
                        </>
                      ) : (
                        <label className="inline-flex cursor-pointer items-center gap-1 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700">
                          {coverBusyId === t.id
                            ? "Uploading…"
                            : "🖼️ Set cover image"}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) setCoverFromFile(t.id, f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>

                    {/* Reuse one of the trait's attached images as the cover */}
                    {t.attachments.some((a) =>
                      a.type.startsWith("image/"),
                    ) && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-neutral-500">
                          Use attached:
                        </span>
                        {t.attachments
                          .filter((a) => a.type.startsWith("image/"))
                          .map((a) => {
                            const isCover = t.cover?.id === a.id;
                            return (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() =>
                                  setCoverFromAttachment(
                                    t.id,
                                    a,
                                    t.cover?.id,
                                    t.attachments.map((x) => x.id),
                                  )
                                }
                                title={
                                  isCover
                                    ? "Current cover"
                                    : `Use ${a.name} as cover`
                                }
                                className={`h-9 w-9 overflow-hidden rounded ring-1 ${
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
                  </div>

                  {/* Attachments */}
                  {t.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {t.attachments.map((a) => {
                        const url = api.attachmentUrl(a.id);
                        const isImage = a.type.startsWith("image/");
                        const isPdf = a.type === "application/pdf";
                        return (
                          <div
                            key={a.id}
                            draggable
                            onDragStart={(e) => {
                              setAttachDrag({
                                fromTraitId: t.id,
                                attachmentId: a.id,
                                name: a.name,
                              });
                              e.dataTransfer.effectAllowed = "copyMove";
                              e.stopPropagation();
                            }}
                            onDragEnd={() => {
                              setAttachDrag(null);
                              setAttachDropId(null);
                            }}
                            title="Drag onto another trait to move or copy"
                            className="group relative flex cursor-grab items-center gap-1 rounded border border-neutral-700 bg-neutral-900 p-1"
                          >
                            {isImage ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const items = t.attachments
                                    .filter(
                                      (x) =>
                                        x.type.startsWith("image/") ||
                                        x.type === "application/pdf",
                                    )
                                    .map((x) => ({
                                      id: x.id,
                                      name: x.name,
                                      type: x.type,
                                    }));
                                  setPreview({
                                    items,
                                    index: items.findIndex(
                                      (x) => x.id === a.id,
                                    ),
                                  });
                                }}
                                title={`Preview ${a.name}`}
                              >
                                <img
                                  src={url}
                                  alt={a.name}
                                  className="h-12 w-12 cursor-zoom-in rounded object-cover"
                                />
                              </button>
                            ) : isPdf ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const items = t.attachments
                                    .filter(
                                      (x) =>
                                        x.type.startsWith("image/") ||
                                        x.type === "application/pdf",
                                    )
                                    .map((x) => ({
                                      id: x.id,
                                      name: x.name,
                                      type: x.type,
                                    }));
                                  setPreview({
                                    items,
                                    index: items.findIndex(
                                      (x) => x.id === a.id,
                                    ),
                                  });
                                }}
                                className="max-w-[8rem] truncate text-xs text-sky-400 underline"
                                title={`Preview ${a.name}`}
                              >
                                📄 {a.name}
                              </button>
                            ) : (
                              <a
                                href={url}
                                download={a.name}
                                className="max-w-[8rem] truncate text-xs text-sky-400 underline"
                                title={`Download ${a.name}`}
                              >
                                📎 {a.name}
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => onRemoveAttachment(t.id, a.id)}
                              className="absolute -right-1.5 -top-1.5 rounded-full bg-neutral-800 px-1 text-[10px] text-neutral-300 opacity-0 hover:text-red-400 group-hover:opacity-100"
                              aria-label={`Remove ${a.name}`}
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {uploadingId === t.id && (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded bg-neutral-800">
                        <div
                          className="h-full bg-sky-500 transition-all"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <span className="w-9 text-right text-[10px] text-neutral-400">
                        {uploadProgress}%
                      </span>
                    </div>
                  )}

                  <label className="inline-flex w-fit cursor-pointer items-center gap-1 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700">
                    {uploadingId === t.id
                      ? "Uploading…"
                      : `📎 Attach files (max ${MAX_ATTACHMENT_MB} MB)`}
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        onUpload(t.id, e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {uploadError && (
                    <p className="text-[11px] text-red-400">{uploadError}</p>
                  )}
                  {attachBusy && (
                    <p className="text-[11px] text-emerald-300">
                      Copying attachment…
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Add a trait…"
          className="flex-1 rounded bg-neutral-800 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-sky-500"
        />
        <button
          type="button"
          onClick={submit}
          className="rounded bg-sky-600 px-3 py-1 text-sm hover:bg-sky-500"
        >
          Add
        </button>
      </div>

      {preview && previewItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
          onClick={() => setPreview(null)}
        >
          {preview.items.length > 1 && (
            <button
              type="button"
              aria-label="Previous"
              onClick={(e) => {
                e.stopPropagation();
                stepPreview(-1);
              }}
              className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-2xl leading-none text-white hover:bg-black/70"
            >
              ‹
            </button>
          )}
          <div
            className="flex max-h-full max-w-full flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            {previewItem.type === "application/pdf" ? (
              <PdfViewer url={api.attachmentUrl(previewItem.id)} />
            ) : (
              <div className="flex max-h-[80vh] items-center justify-center overflow-auto rounded-lg bg-neutral-900 p-2 shadow-2xl ring-1 ring-white/10">
                <img
                  src={api.attachmentUrl(previewItem.id)}
                  alt={previewItem.name}
                  className="max-h-[76vh] max-w-[88vw] object-contain"
                  style={{ imageRendering: "auto" }}
                />
              </div>
            )}
            <div className="flex items-center gap-3">
              {preview.items.length > 1 && (
                <span className="text-xs tabular-nums text-neutral-400">
                  {preview.index + 1} / {preview.items.length}
                </span>
              )}
              <span className="max-w-[40vw] truncate text-sm text-neutral-300">
                {previewItem.name}
              </span>
              <a
                href={api.attachmentUrl(previewItem.id)}
                download={previewItem.name}
                className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
              >
                ⬇ Download
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
          {preview.items.length > 1 && (
            <button
              type="button"
              aria-label="Next"
              onClick={(e) => {
                e.stopPropagation();
                stepPreview(1);
              }}
              className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-2xl leading-none text-white hover:bg-black/70"
            >
              ›
            </button>
          )}
        </div>
      )}

      {embedPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
          onClick={() => setEmbedPreview(null)}
        >
          <div
            className={`flex max-h-[86vh] flex-col gap-3 overflow-auto ${
              embedPreview.kind === "youtube" ? "w-[720px]" : "w-[380px]"
            } max-w-full`}
            onClick={(e) => e.stopPropagation()}
          >
            {embedPreview.kind === "youtube" ? (
              <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
                <iframe
                  src={`https://www.youtube.com/embed/${embedPreview.videoId}`}
                  title="YouTube preview"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full"
                />
              </div>
            ) : (
              <InstagramEmbed url={embedPreview.url} />
            )}
            <div className="flex items-center justify-end gap-3">
              <a
                href={embedPreview.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded bg-pink-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-500"
              >
                {embedPreview.kind === "youtube"
                  ? "Open in YouTube"
                  : "Open in Instagram"}
              </a>
              <button
                type="button"
                onClick={() => setEmbedPreview(null)}
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
