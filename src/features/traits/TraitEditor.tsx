/** Trait editor: add, rename, describe, check off, reorder, and remove.
 *  Clicking a trait opens its description editor. */

import { useState } from "react";
import { useGraphStore } from "../../state/graphStore";
import { api, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_MB } from "../../api/client";
import { linkify } from "../../lib/linkify";
import type { Id, Trait } from "../../domain/types";

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
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(
    null,
  );

  const addTrait = useGraphStore((s) => s.addTrait);
  const removeTrait = useGraphStore((s) => s.removeTrait);
  const renameTrait = useGraphStore((s) => s.renameTrait);
  const setTraitDescription = useGraphStore((s) => s.setTraitDescription);
  const addTraitAttachment = useGraphStore((s) => s.addTraitAttachment);
  const removeTraitAttachment = useGraphStore((s) => s.removeTraitAttachment);
  const toggleTrait = useGraphStore((s) => s.toggleTrait);
  const reorderTraits = useGraphStore((s) => s.reorderTraits);

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

  return (
    <div>
      <ul className="mb-2 flex flex-col gap-1">
        {traits.length === 0 && (
          <li className="text-xs text-neutral-500">No traits yet.</li>
        )}
        {traits.map((t, index) => {
          const isOpen = openId === t.id;
          return (
            <li
              key={t.id}
              draggable={editingId === null && !isOpen}
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null) reorderTraits(nodeId, dragIndex, index);
                setDragIndex(null);
              }}
              className={`rounded ${dragIndex === index ? "opacity-50" : ""}`}
            >
              <div className="group flex items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-neutral-800">
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

                {editingId === t.id ? (
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
                ) : (
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
                )}

                <div className="flex items-center opacity-0 group-hover:opacity-100">
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
                </div>
              </div>

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

                  {/* Attachments */}
                  {t.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {t.attachments.map((a) => {
                        const url = api.attachmentUrl(a.id);
                        const isImage = a.type.startsWith("image/");
                        return (
                          <div
                            key={a.id}
                            className="group relative flex items-center gap-1 rounded border border-neutral-700 bg-neutral-900 p-1"
                          >
                            {isImage ? (
                              <button
                                type="button"
                                onClick={() => setPreview({ url, name: a.name })}
                                title={`Preview ${a.name}`}
                              >
                                <img
                                  src={url}
                                  alt={a.name}
                                  className="h-12 w-12 cursor-zoom-in rounded object-cover"
                                />
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

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
          onClick={() => setPreview(null)}
        >
          <div
            className="flex max-h-full max-w-full flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex max-h-[80vh] items-center justify-center overflow-auto rounded-lg bg-neutral-900 p-2 shadow-2xl ring-1 ring-white/10">
              <img
                src={preview.url}
                alt={preview.name}
                className="max-h-[76vh] max-w-[88vw] object-contain"
                style={{ imageRendering: "auto" }}
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="max-w-[50vw] truncate text-sm text-neutral-300">
                {preview.name}
              </span>
              <a
                href={preview.url}
                download={preview.name}
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
        </div>
      )}
    </div>
  );
}
