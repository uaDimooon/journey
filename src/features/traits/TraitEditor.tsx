/** Trait editor: add, rename, check off, reorder (drag or up/down), and remove. */

import { useState } from "react";
import { useGraphStore } from "../../state/graphStore";
import { linkify } from "../../lib/linkify";
import type { Id, Trait } from "../../domain/types";

export function TraitEditor({ nodeId, traits }: { nodeId: Id; traits: Trait[] }) {
  const [value, setValue] = useState("");
  const [editingId, setEditingId] = useState<Id | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const addTrait = useGraphStore((s) => s.addTrait);
  const removeTrait = useGraphStore((s) => s.removeTrait);
  const renameTrait = useGraphStore((s) => s.renameTrait);
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
        {traits.map((t, index) => (
          <li
            key={t.id}
            draggable={editingId === null}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null) reorderTraits(nodeId, dragIndex, index);
              setDragIndex(null);
            }}
            className={`group flex items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-neutral-800 ${
              dragIndex === index ? "opacity-50" : ""
            }`}
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
                onClick={() => startEdit(t)}
                title="Click to rename"
                className={`min-w-0 flex-1 truncate text-left ${
                  t.done ? "text-neutral-500 line-through" : ""
                }`}
              >
                {linkify(t.name)}
              </button>
            )}

            <div className="flex items-center opacity-0 group-hover:opacity-100">
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
          </li>
        ))}
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
