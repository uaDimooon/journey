import { useEffect } from "react";
import { useAuthStore } from "./state/authStore";
import { useGraphStore } from "./state/graphStore";
import { useGraphSync } from "./features/app/useGraphSync";
import { AuthScreen } from "./features/auth/AuthScreen";
import { DetailPanel } from "./features/panel/DetailPanel";
import { CanvasView } from "./features/canvas/CanvasView";
import { CopyMoveDialog } from "./features/app/CopyMoveDialog";

function AuthedApp({ userId }: { userId: string }) {
  useGraphSync(userId);
  const hydrated = useGraphStore((s) => s.hydrated);

  if (!hydrated) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-neutral-950 text-sm text-neutral-500">
        Loading your journey…
      </div>
    );
  }

  return (
    <div className="flex h-full w-full">
      <DetailPanel />
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
