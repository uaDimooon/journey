/** Export selected traits as a single PNG: a vertical list where each item is a
 *  snapshot of the trait (its cover image + title). Rendered with the Canvas 2D
 *  API so it needs no extra dependencies. Cover images are same-origin (served
 *  by our API), so the canvas stays untainted and can be exported. */

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import type { Id, Trait } from "../../domain/types";

const FONT = "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = test;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  // Ellipsize the last line if we ran out of room.
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    const consumed = lines.join(" ");
    if (consumed.length < text.length) {
      while (last && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = `${last}…`;
    }
  }
  return lines;
}

export function TraitExportModal({
  traits,
  nodeName,
  onClose,
}: {
  traits: Trait[];
  nodeName: string;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<Id>>(
    () => new Set(traits.map((t) => t.id)),
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const toggle = (id: Id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const chosen = traits.filter((t) => selected.has(t.id));

  const render = useCallback(async () => {
    const items = traits.filter((t) => selected.has(t.id));
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    const dpr = 2;
    const W = 520;
    const pad = 20;
    const headerH = items.length ? 64 : 40;
    const cardH = 132;
    const gap = 12;
    const S = cardH - 24; // cover square
    const H =
      pad * 2 +
      headerH +
      (items.length
        ? items.length * cardH + (items.length - 1) * gap
        : 40);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = "#0f1115";
    ctx.fillRect(0, 0, W, H);

    // Header
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText(nodeName || "Traits", pad, pad + 24);
    ctx.fillStyle = "#8a8f98";
    ctx.font = `400 13px ${FONT}`;
    ctx.fillText(
      `${items.length} trait${items.length === 1 ? "" : "s"}`,
      pad,
      pad + 46,
    );

    if (items.length === 0) {
      setPreviewUrl(canvas.toDataURL("image/png"));
      return;
    }

    const imgs = await Promise.all(
      items.map((t) =>
        t.cover ? loadImage(api.attachmentUrl(t.cover.id)) : Promise.resolve(null),
      ),
    );

    let y = pad + headerH;
    items.forEach((t, i) => {
      // Card background
      ctx.fillStyle = "#17181c";
      roundRect(ctx, pad, y, W - pad * 2, cardH, 12);
      ctx.fill();

      const cx = pad + 12;
      const cy = y + 12;
      const img = imgs[i];
      if (img && img.width > 0) {
        const scale = Math.max(S / img.width, S / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.save();
        roundRect(ctx, cx, cy, S, S, 10);
        ctx.clip();
        ctx.drawImage(img, cx + (S - w) / 2, cy + (S - h) / 2, w, h);
        ctx.restore();
      } else {
        // Placeholder tile with the trait's initial.
        ctx.fillStyle = "#2a2b31";
        roundRect(ctx, cx, cy, S, S, 10);
        ctx.fill();
        ctx.fillStyle = "#6b7280";
        ctx.font = `600 40px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText((t.name[0] || "?").toUpperCase(), cx + S / 2, cy + S / 2);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      }

      // Title
      const tx = cx + S + 16;
      const maxW = W - pad - tx - 4;
      ctx.font = `600 19px ${FONT}`;
      ctx.fillStyle = t.done ? "#9ca3af" : "#f5f5f5";
      const lines = wrapLines(ctx, t.name, maxW, 3);
      const lineH = 25;
      const blockH = lines.length * lineH;
      let ty = y + (cardH - blockH) / 2 + 19;
      for (const ln of lines) {
        ctx.fillText(ln, tx, ty);
        if (t.done) {
          const w = ctx.measureText(ln).width;
          ctx.strokeStyle = "#9ca3af";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(tx, ty - 6);
          ctx.lineTo(tx + w, ty - 6);
          ctx.stroke();
        }
        ty += lineH;
      }

      y += cardH + gap;
    });

    setPreviewUrl(canvas.toDataURL("image/png"));
  }, [traits, selected, nodeName]);

  useEffect(() => {
    setRendering(true);
    render().finally(() => setRendering(false));
  }, [render]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const safe = (nodeName || "traits")
      .replace(/[^\w-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safe || "traits"}-traits.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-[760px] max-w-full gap-4 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Selection list */}
        <div className="flex w-64 shrink-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Export traits</h2>
            <button
              type="button"
              onClick={() =>
                setSelected((prev) =>
                  prev.size === traits.length
                    ? new Set()
                    : new Set(traits.map((t) => t.id)),
                )
              }
              className="text-xs text-sky-400 hover:text-sky-300"
            >
              {selected.size === traits.length ? "Clear all" : "Select all"}
            </button>
          </div>
          <ul className="flex flex-1 flex-col gap-1 overflow-y-auto">
            {traits.map((t) => (
              <li key={t.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-neutral-200 hover:bg-neutral-800">
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => toggle(t.id)}
                    className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-sky-500"
                  />
                  {t.cover ? (
                    <img
                      src={api.attachmentUrl(t.cover.id)}
                      alt=""
                      className="h-7 w-7 shrink-0 rounded object-cover ring-1 ring-neutral-700"
                    />
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-neutral-800 text-[10px] text-neutral-500 ring-1 ring-neutral-700">
                      {(t.name[0] || "?").toUpperCase()}
                    </span>
                  )}
                  <span
                    className={`min-w-0 flex-1 truncate ${
                      t.done ? "text-neutral-500 line-through" : ""
                    }`}
                  >
                    {t.name}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        {/* Preview + actions */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex-1 overflow-auto rounded bg-neutral-950 p-3">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Traits export preview"
                className="mx-auto w-full max-w-[420px] rounded shadow-lg"
              />
            ) : (
              <p className="p-6 text-center text-xs text-neutral-500">
                {chosen.length ? "Rendering…" : "Select traits to export."}
              </p>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-3 py-1.5 text-sm text-neutral-400 hover:text-white"
            >
              Close
            </button>
            <button
              type="button"
              onClick={download}
              disabled={!previewUrl || chosen.length === 0 || rendering}
              className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
            >
              Download PNG
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
