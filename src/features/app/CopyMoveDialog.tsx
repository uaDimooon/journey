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
        className="flex w-[320px] max-w-full flex-col gap-4 rounded-lg border border-neutral-700 bg-neutral-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-neutral-200">{label}</p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => pick(null)}
            className="rounded px-3 py-1.5 text-sm text-neutral-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => pick("copy")}
            className="rounded bg-neutral-700 px-3 py-1.5 text-sm text-neutral-100 hover:bg-neutral-600"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={() => pick("move")}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
          >
            Move
          </button>
        </div>
      </div>
    </div>
  );
}
