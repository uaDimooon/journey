/** Mounts the imperative PixiJS canvas into React. */

import { useEffect, useRef } from "react";
import { CanvasRenderer } from "../../render/CanvasRenderer";

export function CanvasView() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new CanvasRenderer();
    let disposed = false;

    renderer
      .init(host)
      .then(() => {
        // If unmounted before init finished, tear down immediately.
        if (disposed) renderer.destroy();
      })
      .catch((err) => {
        console.error("Failed to init canvas renderer", err);
      });

    return () => {
      disposed = true;
      renderer.destroy();
    };
  }, []);

  return <div ref={hostRef} className="h-full w-full" />;
}
