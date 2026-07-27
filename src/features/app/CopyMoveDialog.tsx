/** Modal that resolves the shared chooseCopyOrMove() promise. */

import { useEffect } from "react";
import { useChooseStore } from "../../state/chooseStore";

export function CopyMoveDialog() {
  const open = useChooseStore((s) => s.open);
  const label = useChooseStore((s) => s.label);
  const pick = useChooseStore((s) => s.pick);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") pick(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pick]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6"
      onClick={() => pick(null)}
    >
      <div
        className="flex w-[320px] max-w-full flex-col gap-4 rounded-lg border border-border bg-panel p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-ink">{label}</p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => pick(null)}
            className="rounded px-3 py-1.5 text-sm text-ink-muted hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => pick("copy")}
            className="rounded bg-control px-3 py-1.5 text-sm text-ink hover:bg-control-hover"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={() => pick("move")}
            className="rounded bg-accent-strong px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Move
          </button>
        </div>
      </div>
    </div>
  );
}
