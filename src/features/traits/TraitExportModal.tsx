/** Export selected traits (and, optionally, images inside them) as a single PNG.
 *  Layout is a grid: one row per trait, whose first tile is the trait's cover
 *  (with the title overlaid) followed by any selected images from that trait.
 *  Rendered with the Canvas 2D API — no extra dependencies. Cover/attachment
 *  images are same-origin, so the canvas stays untainted and exportable. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/client";
import type { Id, Trait, TraitAttachment } from "../../domain/types";

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

// The image attachments of a trait, excluding whatever is already its cover.
function extraImages(t: Trait): TraitAttachment[] {
  return t.attachments.filter(
    (a) => a.type.startsWith("image/") && a.id !== t.cover?.id,
  );
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
  // Which traits are included (their cover + title lead each row).
  const [included, setIncluded] = useState<Set<Id>>(
    () => new Set(traits.map((t) => t.id)),
  );
  // Which extra images (by attachment id) are added to their trait's row.
  const [selectedImgs, setSelectedImgs] = useState<Set<Id>>(() => new Set());
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgCache = useRef<Map<string, HTMLImageElement | null>>(new Map());

  const allImageIds = useMemo(
    () => traits.flatMap((t) => extraImages(t).map((a) => a.id)),
    [traits],
  );

  const toggleTrait = (id: Id) =>
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleImg = (id: Id) =>
    setSelectedImgs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAll = () => {
    setIncluded(new Set(traits.map((t) => t.id)));
    setSelectedImgs(new Set(allImageIds));
  };
  const deselectAll = () => {
    setIncluded(new Set());
    setSelectedImgs(new Set());
  };

  const cachedImage = useCallback(async (id: string) => {
    if (imgCache.current.has(id)) return imgCache.current.get(id) ?? null;
    const img = await loadImage(api.attachmentUrl(id));
    imgCache.current.set(id, img);
    return img;
  }, []);

  // Build each included trait's row of image tiles (cover first, then extras).
  const rowsFor = useCallback(() => {
    return traits
      .filter((t) => included.has(t.id))
      .map((t) => {
        const chosen = extraImages(t).filter((a) => selectedImgs.has(a.id));
        const tiles: (TraitAttachment | null)[] = [];
        if (t.cover) tiles.push(t.cover);
        for (const a of chosen) tiles.push(a);
        if (tiles.length === 0) tiles.push(null); // placeholder lead
        return { trait: t, tiles };
      });
  }, [traits, included, selectedImgs]);

  const render = useCallback(async () => {
    const rows = rowsFor();
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    const dpr = 2;
    const P = 20;
    const T = 150; // tile size
    const G = 10; // gap between tiles
    const rowGap = 16;
    const headerH = 56;

    // Preload every tile image.
    const ids = new Set<string>();
    for (const r of rows) for (const tile of r.tiles) if (tile) ids.add(tile.id);
    const loaded = new Map<string, HTMLImageElement | null>();
    await Promise.all(
      [...ids].map(async (id) => loaded.set(id, await cachedImage(id))),
    );

    const rowWidths = rows.map(
      (r) => r.tiles.length * T + (r.tiles.length - 1) * G,
    );
    const contentW = Math.max(260, ...(rowWidths.length ? rowWidths : [260]));
    const W = P * 2 + contentW;
    const H =
      P * 2 +
      headerH +
      (rows.length ? rows.length * T + (rows.length - 1) * rowGap : 40);

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = "#0f1115";
    ctx.fillRect(0, 0, W, H);

    // Header
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText(nodeName || "Traits", P, P + 24);
    ctx.fillStyle = "#8a8f98";
    ctx.font = `400 13px ${FONT}`;
    const imgCount = rows.reduce(
      (n, r) => n + r.tiles.filter(Boolean).length,
      0,
    );
    ctx.fillText(
      `${rows.length} trait${rows.length === 1 ? "" : "s"} · ${imgCount} image${
        imgCount === 1 ? "" : "s"
      }`,
      P,
      P + 46,
    );

    if (rows.length === 0) {
      setPreviewUrl(canvas.toDataURL("image/png"));
      return;
    }

    const drawTile = (
      ref: TraitAttachment | null,
      x: number,
      y: number,
      withTitle: string | null,
      done: boolean,
    ) => {
      const img = ref ? loaded.get(ref.id) : null;
      ctx.save();
      roundRect(ctx, x, y, T, T, 12);
      ctx.clip();
      if (img && img.width > 0) {
        const scale = Math.max(T / img.width, T / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, x + (T - w) / 2, y + (T - h) / 2, w, h);
      } else {
        ctx.fillStyle = "#2a2b31";
        ctx.fillRect(x, y, T, T);
      }
      if (withTitle !== null) {
        // Gradient + title overlay on the lead (cover) tile.
        const grad = ctx.createLinearGradient(0, y + T * 0.4, 0, y + T);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, "rgba(0,0,0,0.85)");
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, T, T);
        ctx.fillStyle = "#ffffff";
        ctx.font = `600 15px ${FONT}`;
        const lines = wrapLines(ctx, withTitle, T - 16, 2);
        let ty = y + T - 12 - (lines.length - 1) * 18;
        for (const ln of lines) {
          ctx.fillText(ln, x + 8, ty);
          if (done) {
            const w = ctx.measureText(ln).width;
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x + 8, ty - 5);
            ctx.lineTo(x + 8 + w, ty - 5);
            ctx.stroke();
          }
          ty += 18;
        }
      }
      ctx.restore();
      // Subtle border
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      roundRect(ctx, x + 0.5, y + 0.5, T - 1, T - 1, 12);
      ctx.stroke();
    };

    let y = P + headerH;
    for (const r of rows) {
      let x = P;
      r.tiles.forEach((tile, i) => {
        drawTile(tile, x, y, i === 0 ? r.trait.name : null, r.trait.done);
        x += T + G;
      });
      y += T + rowGap;
    }

    setPreviewUrl(canvas.toDataURL("image/png"));
  }, [rowsFor, nodeName, cachedImage]);

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

  const hasContent = included.size > 0;

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
        className="flex max-h-[88vh] w-[820px] max-w-full gap-4 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Selection list */}
        <div className="flex w-72 shrink-0 flex-col gap-2">
          <h2 className="text-sm font-semibold text-white">Export traits</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={deselectAll}
              className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
            >
              Deselect all
            </button>
          </div>
          <ul className="flex flex-1 flex-col gap-1 overflow-y-auto pr-1">
            {traits.map((t) => {
              const extras = extraImages(t);
              const on = included.has(t.id);
              return (
                <li
                  key={t.id}
                  className="rounded border border-neutral-800 bg-neutral-900/60 p-1.5"
                >
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-200">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleTrait(t.id)}
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
                  {on && extras.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1 pl-6">
                      {extras.map((a) => {
                        const sel = selectedImgs.has(a.id);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => toggleImg(a.id)}
                            title={sel ? `Remove ${a.name}` : `Add ${a.name}`}
                            className={`h-9 w-9 overflow-hidden rounded ring-1 transition ${
                              sel
                                ? "ring-2 ring-sky-400"
                                : "opacity-60 ring-neutral-700 hover:opacity-100"
                            }`}
                          >
                            <img
                              src={api.attachmentUrl(a.id)}
                              alt={a.name}
                              className="h-full w-full object-cover"
                            />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Preview + actions */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-1 items-center justify-center overflow-auto rounded bg-neutral-950 p-3">
            {previewUrl && hasContent ? (
              <img
                src={previewUrl}
                alt="Traits export preview"
                className="max-h-full max-w-full rounded shadow-lg"
              />
            ) : (
              <p className="p-6 text-center text-xs text-neutral-500">
                Select traits to export.
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
              disabled={!previewUrl || !hasContent || rendering}
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
