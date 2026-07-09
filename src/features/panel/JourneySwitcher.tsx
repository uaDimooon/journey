/** Journey switcher: pick the active journey, create, rename, or delete.
 *  Uses inline controls (no window.prompt/confirm, which some embedded
 *  browsers don't support). */

import { useRef, useState } from "react";
import { useJourneysStore } from "../../state/journeysStore";
import { useGraphStore } from "../../state/graphStore";
import { downloadJourney, parseJourneyFile } from "../../lib/journeyFile";

export function JourneySwitcher() {
  const journeys = useJourneysStore((s) => s.journeys);
  const currentId = useJourneysStore((s) => s.currentId);
  const open = useJourneysStore((s) => s.open);
  const create = useJourneysStore((s) => s.create);
  const importJourney = useJourneysStore((s) => s.importJourney);
  const mergeInto = useJourneysStore((s) => s.mergeInto);
  const rename = useJourneysStore((s) => s.rename);
  const remove = useJourneysStore((s) => s.remove);

  const current = journeys.find((j) => j.id === currentId) ?? null;
  const others = journeys.filter((j) => j.id !== currentId);

  const [mode, setMode] = useState<
    "idle" | "rename" | "confirmDelete" | "merge"
  >("idle");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mergeSourceId, setMergeSourceId] = useState<string>("");
  const [merging, setMerging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const onExport = () => {
    if (!current) return;
    // Export the current in-memory graph (includes unsaved edits).
    downloadJourney(current.name, useGraphStore.getState().graph);
  };

  const onImportFile = async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const { name, graph } = parseJourneyFile(text);
      await importJourney(name, graph);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const startMerge = () => {
    setError(null);
    setMergeSourceId(others[0]?.id ?? "");
    setMode("merge");
  };

  const onMerge = async () => {
    if (!mergeSourceId) return;
    setMerging(true);
    setError(null);
    try {
      await mergeInto(mergeSourceId);
      setMode("idle");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setMerging(false);
    }
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
      ) : mode === "merge" ? (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-neutral-400">
            Merge another journey into this one:
          </span>
          <div className="flex items-center gap-1">
            <select
              value={mergeSourceId}
              onChange={(e) => setMergeSourceId(e.target.value)}
              className="min-w-0 flex-1 truncate rounded bg-neutral-800 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-sky-500"
            >
              {others.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onMerge}
              disabled={merging || !mergeSourceId}
              className="rounded bg-sky-600 px-2 py-1 text-xs hover:bg-sky-500 disabled:opacity-50"
            >
              {merging ? "Merging…" : "Merge"}
            </button>
            <button
              type="button"
              onClick={() => setMode("idle")}
              className="rounded bg-neutral-700 px-2 py-1 text-xs hover:bg-neutral-600"
            >
              Cancel
            </button>
          </div>
          <span className="text-[10px] text-neutral-500">
            The source journey is kept; its goals, traits and links are copied in.
          </span>
        </div>
      ) : (
        mode === "idle" && (
          <div className="flex flex-wrap gap-3 text-[11px] text-neutral-500">
            <button
              type="button"
              onClick={startRename}
              className="hover:text-white"
            >
              Rename
            </button>
            <button type="button" onClick={onExport} className="hover:text-white">
              Export
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="hover:text-white"
            >
              Import
            </button>
            {others.length > 0 && (
              <button
                type="button"
                onClick={startMerge}
                className="hover:text-white"
              >
                Merge
              </button>
            )}
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

      {error && <p className="text-[11px] text-red-400">{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImportFile(file);
          e.target.value = ""; // allow re-importing the same file
        }}
      />
    </div>
  );
}
