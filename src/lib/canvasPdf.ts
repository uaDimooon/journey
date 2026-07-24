/** Build a minimal single-page PDF that embeds a canvas as a JPEG image.
 *  Dependency-free: PDFs support JPEG streams directly via /DCTDecode, so we
 *  encode the canvas to JPEG and wrap it in a hand-written PDF. */

export async function canvasToPdfBlob(
  canvas: HTMLCanvasElement,
  quality = 0.92,
): Promise<Blob> {
  const jpegBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!jpegBlob) throw new Error("Could not encode the export image.");
  const jpeg = new Uint8Array(await jpegBlob.arrayBuffer());

  const iw = canvas.width;
  const ih = canvas.height;
  // Page size in points; halve the device pixels (canvas is drawn at dpr 2).
  const pw = Math.max(1, Math.round(iw / 2));
  const ph = Math.max(1, Math.round(ih / 2));

  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === "string" ? enc.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const mark = (n: number) => {
    offsets[n] = length;
  };

  push("%PDF-1.3\n");

  mark(1);
  push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  mark(2);
  push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

  mark(3);
  push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] ` +
      `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  );

  mark(4);
  push(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${iw} /Height ${ih} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
      `/Length ${jpeg.length} >>\nstream\n`,
  );
  push(jpeg);
  push("\nendstream\nendobj\n");

  const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  mark(5);
  push(
    `5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`,
  );

  const xrefStart = length;
  const objCount = 6; // objects 0..5
  push(`xref\n0 ${objCount}\n`);
  push("0000000000 65535 f \n");
  for (let i = 1; i < objCount; i++) {
    push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  push(
    `trailer\n<< /Size ${objCount} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`,
  );

  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}
