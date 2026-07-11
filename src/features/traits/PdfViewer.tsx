/** Minimal in-app PDF reader.
 *  Renders every page to a canvas with PDF.js so it works in any browser or
 *  webview, without relying on the browser's built-in PDF plugin. */

import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export function PdfViewer({ url }: { url: string }) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const pages = pagesRef.current;
    setStatus("loading");
    setPageCount(0);
    if (pages) pages.innerHTML = "";

    const task = pdfjs.getDocument({ url, withCredentials: true });
    (async () => {
      try {
        const doc = await task.promise;
        if (cancelled) return;
        setPageCount(doc.numPages);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: 1.4 * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${viewport.width / dpr}px`;
          canvas.className =
            "mb-3 max-w-full rounded bg-white shadow-lg ring-1 ring-black/10";
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          pages?.appendChild(canvas);
          await page.render({ canvasContext: ctx, viewport }).promise;
        }
        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to render PDF", err);
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      task.destroy();
    };
  }, [url]);

  return (
    <div className="flex h-[80vh] w-[85vw] max-w-[900px] flex-col overflow-hidden rounded-lg bg-neutral-800 ring-1 ring-white/10">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-xs text-neutral-400">
        <span>
          {status === "loading" && "Loading…"}
          {status === "ready" &&
            `${pageCount} ${pageCount === 1 ? "page" : "pages"}`}
          {status === "error" && "Could not display this PDF"}
        </span>
      </div>
      <div className="flex-1 overflow-auto bg-neutral-900 p-4">
        {status === "error" ? (
          <p className="mt-8 text-center text-sm text-neutral-400">
            Something went wrong rendering this PDF. Use Download to open it.
          </p>
        ) : (
          <div ref={pagesRef} className="flex flex-col items-center" />
        )}
      </div>
    </div>
  );
}
