/** Journey switcher: pick the active journey, create, rename, or delete.
 *  Uses inline controls (no window.prompt/confirm, which some embedded
 *  browsers don't support). */

import { useState } from "react";
import { useJourneysStore } from "../../state/journeysStore";

export function JourneySwitcher() {
  const journeys = useJourneysStore((s) => s.journeys);
  const currentId = useJourneysStore((s) => s.currentId);
  const open = useJourneysStore((s) => s.open);
  const create = useJourneysStore((s) => s.create);
  const rename = useJourneysStore((s) => s.rename);
  const remove = useJourneysStore((s) => s.remove);

  const current = journeys.find((j) => j.id === currentId) ?? null;

  const [mode, setMode] = useState<"idle" | "rename" | "confirmDelete">("idle");
  const [draft, setDraft] = useState("");

  const startRename = () => {
    if (!current) return;
    setDraft(current.name);
    setMode("rename");
  };

  const commitRename = async () => {
    if (current && draft.trim()) await rename(current.id, draft.trim());
    setMode("idle");
  };

  const onCreate = async () => {
    await create("Untitled journey");
    // Immediately let the user name the freshly created (now current) journey.
    setDraft("Untitled journey");
    setMode("rename");
  };

  const onDelete = async () => {
    if (!current) return;
    await remove(current.id);
    setMode("idle");
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wide text-neutral-500">
        Journey
      </label>

      {mode === "rename" ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setMode("idle");
            }}
            className="min-w-0 flex-1 rounded bg-neutral-800 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-sky-500"
          />
          <button
            type="button"
            onClick={commitRename}
            className="rounded bg-sky-600 px-2 py-1 text-xs hover:bg-sky-500"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setMode("idle")}
            className="rounded bg-neutral-700 px-2 py-1 text-xs hover:bg-neutral-600"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <select
            value={currentId ?? ""}
            onChange={(e) => open(e.target.value)}
            className="min-w-0 flex-1 truncate rounded bg-neutral-800 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-sky-500"
          >
            {journeys.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onCreate}
            title="New journey"
            className="rounded bg-sky-600 px-2 py-1 text-sm hover:bg-sky-500"
          >
            +
          </button>
        </div>
      )}

      {mode === "confirmDelete" ? (
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-neutral-400">Delete this journey?</span>
          <button
            type="button"
            onClick={onDelete}
            className="text-red-400 hover:text-red-300"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setMode("idle")}
            className="text-neutral-500 hover:text-white"
          >
            Cancel
          </button>
        </div>
      ) : (
        mode === "idle" && (
          <div className="flex gap-3 text-[11px] text-neutral-500">
            <button
              type="button"
              onClick={startRename}
              className="hover:text-white"
            >
              Rename
            </button>
            {journeys.length > 1 && (
              <button
                type="button"
                onClick={() => setMode("confirmDelete")}
                className="hover:text-red-400"
              >
                Delete
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}
