/** Trait tag editor for a node. */

import { useState } from "react";
import { useGraphStore } from "../../state/graphStore";
import type { Id } from "../../domain/types";

export function TraitEditor({ nodeId, traits }: { nodeId: Id; traits: string[] }) {
  const [value, setValue] = useState("");
  const addTrait = useGraphStore((s) => s.addTrait);
  const removeTrait = useGraphStore((s) => s.removeTrait);

  const submit = () => {
    const t = value.trim();
    if (!t) return;
    addTrait(nodeId, t);
    setValue("");
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        {traits.length === 0 && (
          <span className="text-xs text-neutral-500">No traits yet.</span>
        )}
        {traits.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-neutral-700 px-2 py-0.5 text-xs"
          >
            {t}
            <button
              type="button"
              onClick={() => removeTrait(nodeId, t)}
              className="text-neutral-400 hover:text-white"
              aria-label={`Remove ${t}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
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
