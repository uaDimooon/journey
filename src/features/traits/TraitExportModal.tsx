/** Export selected traits — including nested sub-traits — as a single PNG.
 *  Layout is an indented outline: each included trait shows its cover, title,
 *  the FULL description text, and any selected images; children are indented
 *  under their parent. Rendered with the Canvas 2D API (no dependencies);
 *  images are same-origin so the canvas stays untainted and exportable. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/client";
import { canvasToPdfBlob } from "../../lib/canvasPdf";
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

// Wrap text to a width, keeping ALL of it (honours explicit newlines). No cap.
function wrapFull(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    if (para.trim() === "") {
      out.push("");
      continue;
    }
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

// The image attachments of a trait, excluding whatever is already its cover.
function extraImages(t: Trait): TraitAttachment[] {
  return t.attachments.filter(
    (a) => a.type.startsWith("image/") && a.id !== t.cover?.id,
  );
}

// Flatten the trait tree into an in-order list with depth, so nested traits are
// selectable and exportable.
function flattenTraits(
  traits: Trait[],
  depth = 0,
): { trait: Trait; depth: number }[] {
  const out: { trait: Trait; depth: number }[] = [];
  for (const t of traits) {
    out.push({ trait: t, depth });
    if (t.children.length) out.push(...flattenTraits(t.children, depth + 1));
  }
  return out;
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
  const flat = useMemo(() => flattenTraits(traits), [traits]);
  // Which traits are included (including nested ones).
  const [included, setIncluded] = useState<Set<Id>>(
    () => new Set(flat.map((x) => x.trait.id)),
  );
  // Which extra images (by attachment id) are added to their trait.
  const [selectedImgs, setSelectedImgs] = useState<Set<Id>>(() => new Set());
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [exporting, setExporting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgCache = useRef<Map<string, HTMLImageElement | null>>(new Map());

  const allImageIds = useMemo(
    () => flat.flatMap((x) => extraImages(x.trait).map((a) => a.id)),
    [flat],
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
    setIncluded(new Set(flat.map((x) => x.trait.id)));
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

  // Build the ordered list of blocks to draw: every included trait (nested ones
  // too), with its depth and the image tiles to show (cover first, then extras).
  const buildBlocks = useCallback(() => {
    return flat
      .filter((x) => included.has(x.trait.id))
      .map((x) => {
        const chosen = extraImages(x.trait).filter((a) =>
          selectedImgs.has(a.id),
        );
        const tiles: TraitAttachment[] = [];
        if (x.trait.cover) tiles.push(x.trait.cover);
        for (const a of chosen) tiles.push(a);
        return { trait: x.trait, depth: x.depth, tiles };
      });
  }, [flat, included, selectedImgs]);

  const render = useCallback(async () => {
    const blocks = buildBlocks();
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    const dpr = 2;
    const W = 660;
    const P = 24;
    const INDENT = 22;
    const CT = 60; // cover thumbnail (header)
    const IMG = 96; // gallery thumbnail
    const GAP = 8;
    const BLOCK_GAP = 18;
    const TITLE_LH = 22;
    const DESC_LH = 18;
    const headerH0 = 54;

    // Preload every image used.
    const ids = new Set<string>();
    for (const b of blocks) for (const t of b.tiles) ids.add(t.id);
    const loaded = new Map<string, HTMLImageElement | null>();
    await Promise.all(
      [...ids].map(async (id) => loaded.set(id, await cachedImage(id))),
    );

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Measure pass (text metrics are independent of canvas size).
    const measured = blocks.map((b) => {
      const x = P + b.depth * INDENT;
      const contentW = W - x - P;
      const lead = b.tiles[0] ?? null;
      const textX = x + (lead ? CT + 12 : 0);
      const textW = W - textX - P;
      ctx.font = `600 17px ${FONT}`;
      const titleLines = wrapFull(ctx, b.trait.name || "Untitled", textW);
      const headerH = Math.max(lead ? CT : 0, titleLines.length * TITLE_LH);
      const desc = (b.trait.description ?? "").trim();
      ctx.font = `400 13px ${FONT}`;
      const descLines = desc ? wrapFull(ctx, desc, contentW) : [];
      const descH = descLines.length * DESC_LH;
      const gallery = b.tiles.slice(1);
      const perRow = Math.max(1, Math.floor((contentW + GAP) / (IMG + GAP)));
      const gRows = gallery.length ? Math.ceil(gallery.length / perRow) : 0;
      const galleryH = gRows ? gRows * IMG + (gRows - 1) * GAP : 0;
      const height =
        headerH + (descH ? 8 + descH : 0) + (galleryH ? 10 + galleryH : 0);
      return {
        ...b,
        x,
        contentW,
        lead,
        textX,
        titleLines,
        headerH,
        descLines,
        gallery,
        perRow,
        height,
      };
    });

    const totalH =
      P +
      headerH0 +
      (measured.length
        ? measured.reduce((s, m) => s + m.height + BLOCK_GAP, 0)
        : 20);

    canvas.width = W * dpr;
    canvas.height = totalH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = "#0f1115";
    ctx.fillRect(0, 0, W, totalH);

    // Header
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText(nodeName || "Traits", P, P + 24);
    ctx.fillStyle = "#8a8f98";
    ctx.font = `400 13px ${FONT}`;
    const imgCount = measured.reduce((n, m) => n + m.tiles.length, 0);
    ctx.fillText(
      `${measured.length} trait${measured.length === 1 ? "" : "s"} · ${imgCount} image${
        imgCount === 1 ? "" : "s"
      }`,
      P,
      P + 46,
    );

    if (measured.length === 0) {
      setPreviewUrl(canvas.toDataURL("image/png"));
      return;
    }

    const drawThumb = (ref: TraitAttachment, x: number, y: number, size: number) => {
      const img = loaded.get(ref.id);
      ctx.save();
      roundRect(ctx, x, y, size, size, 10);
      ctx.clip();
      if (img && img.width > 0) {
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
      } else {
        ctx.fillStyle = "#2a2b31";
        ctx.fillRect(x, y, size, size);
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      roundRect(ctx, x + 0.5, y + 0.5, size - 1, size - 1, 10);
      ctx.stroke();
    };

    const strike = (x: number, y: number, w: number) => {
      ctx.strokeStyle = "#9ca3af";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x + w, y - 5);
      ctx.stroke();
    };

    let y = P + headerH0;
    for (const m of measured) {
      // Depth guide line for nested traits.
      if (m.depth > 0) {
        ctx.strokeStyle = "rgba(255,255,255,0.10)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(m.x - 11, y);
        ctx.lineTo(m.x - 11, y + m.height);
        ctx.stroke();
      }

      // Header: cover thumbnail + title.
      if (m.lead) drawThumb(m.lead, m.x, y, CT);
      ctx.fillStyle = m.trait.done ? "#9ca3af" : "#f5f5f5";
      ctx.font = `600 17px ${FONT}`;
      let ty = y + 16;
      for (const ln of m.titleLines) {
        ctx.fillText(ln, m.textX, ty);
        if (m.trait.done) strike(m.textX, ty, ctx.measureText(ln).width);
        ty += TITLE_LH;
      }

      let cy = y + m.headerH;

      // Full description text.
      if (m.descLines.length) {
        cy += 8;
        ctx.fillStyle = "#c9ccd1";
        ctx.font = `400 13px ${FONT}`;
        for (const ln of m.descLines) {
          ctx.fillText(ln, m.x, cy + 13);
          cy += DESC_LH;
        }
      }

      // Gallery of the trait's selected images.
      if (m.gallery.length) {
        cy += 10;
        let gx = m.x;
        let gy = cy;
        m.gallery.forEach((tile, i) => {
          drawThumb(tile, gx, gy, IMG);
          if ((i + 1) % m.perRow === 0) {
            gx = m.x;
            gy += IMG + GAP;
          } else {
            gx += IMG + GAP;
          }
        });
      }

      y += m.height + BLOCK_GAP;
    }

    setPreviewUrl(canvas.toDataURL("image/png"));
  }, [buildBlocks, nodeName, cachedImage]);

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

  const saveBlob = (blob: Blob, ext: string) => {
    const safe = (nodeName || "traits")
      .replace(/[^\w-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safe || "traits"}-traits.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const download = async (format: "png" | "pdf") => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setExporting(true);
    try {
      if (format === "pdf") {
        saveBlob(await canvasToPdfBlob(canvas), "pdf");
      } else {
        const blob = await new Promise<Blob | null>((res) =>
          canvas.toBlob(res, "image/png"),
        );
        if (blob) saveBlob(blob, "png");
      }
    } finally {
      setExporting(false);
    }
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
            {flat.map(({ trait: t, depth }) => {
              const extras = extraImages(t);
              const on = included.has(t.id);
              return (
                <li
                  key={t.id}
                  className="rounded border border-neutral-800 bg-neutral-900/60 p-1.5"
                  style={{ marginLeft: depth * 14 }}
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
              onClick={() => download("pdf")}
              disabled={!previewUrl || !hasContent || rendering || exporting}
              className="rounded bg-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-100 hover:bg-neutral-600 disabled:opacity-40"
            >
              Download PDF
            </button>
            <button
              type="button"
              onClick={() => download("png")}
              disabled={!previewUrl || !hasContent || rendering || exporting}
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
