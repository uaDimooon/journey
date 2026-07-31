import { useEffect, useState } from "react";
import { useAuthStore } from "./state/authStore";
import { useGraphStore } from "./state/graphStore";
import { useSelectionStore } from "./state/selectionStore";
import { useGraphSync } from "./features/app/useGraphSync";
import { AuthScreen } from "./features/auth/AuthScreen";
import { DetailPanel } from "./features/panel/DetailPanel";
import { CanvasView } from "./features/canvas/CanvasView";
import { CopyMoveDialog } from "./features/app/CopyMoveDialog";

function AuthedApp({ userId }: { userId: string }) {
  useGraphSync(userId);
  const hydrated = useGraphStore((s) => s.hydrated);
  // On phones the panel is an off-canvas drawer (it's a static sidebar at md+).
  const [panelOpen, setPanelOpen] = useState(false);
  const selectedId = useSelectionStore((s) => s.selectedId);
  // Selecting a node (e.g. tapping a goal on the canvas) opens the drawer.
  useEffect(() => {
    if (selectedId) setPanelOpen(true);
  }, [selectedId]);

  if (!hydrated) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-neutral-950 text-sm text-neutral-500">
        Loading your journey…
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      {/* Mobile: open the drawer (hidden on desktop, where the panel is static). */}
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        aria-label="Open panel"
        className={`absolute left-3 top-3 z-30 rounded-md bg-panel/90 px-3 py-2 text-base leading-none text-ink shadow-lg ring-1 ring-border md:hidden ${
          panelOpen ? "hidden" : ""
        }`}
      >
        ☰
      </button>
      {/* Mobile: tap-outside backdrop to dismiss the drawer. */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setPanelOpen(false)}
          aria-hidden="true"
        />
      )}
      <DetailPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
      <main className="relative h-full flex-1">
        <CanvasView />
      </main>
      <CopyMoveDialog />
    </div>
  );
}

export default function App() {
  const user = useAuthStore((s) => s.user);
  const initializing = useAuthStore((s) => s.initializing);
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  if (initializing) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-neutral-950 text-sm text-neutral-500">
        Loading…
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  return <AuthedApp userId={user.id} />;
}
