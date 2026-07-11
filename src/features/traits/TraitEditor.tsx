/** Trait editor: add, rename, describe, check off, reorder, and remove.
 *  Clicking a trait opens its description editor. */

import { useState } from "react";
import { useGraphStore } from "../../state/graphStore";
import { linkify } from "../../lib/linkify";
import type { Id, Trait } from "../../domain/types";

export function TraitEditor({ nodeId, traits }: { nodeId: Id; traits: Trait[] }) {
  const [value, setValue] = useState("");
  const [editingId, setEditingId] = useState<Id | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [openId, setOpenId] = useState<Id | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const addTrait = useGraphStore((s) => s.addTrait);
  const removeTrait = useGraphStore((s) => s.removeTrait);
  const renameTrait = useGraphStore((s) => s.renameTrait);
  const setTraitDescription = useGraphStore((s) => s.setTraitDescription);
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
                <div className="mb-1 mt-1 pl-6 pr-1">
                  <textarea
                    autoFocus
                    value={t.description}
                    onChange={(e) =>
                      setTraitDescription(nodeId, t.id, e.target.value)
                    }
                    placeholder="Add a description for this trait…"
                    rows={3}
                    className="w-full resize-none rounded bg-neutral-900 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-sky-500"
                  />
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
    </div>
  );
}
