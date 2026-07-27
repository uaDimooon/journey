import { test, expect } from "@playwright/test";
import { signup, waitCanvasReady } from "./helpers";

// UC-13: lossless journey export & re-import. The exported blob is captured via
// URL.createObjectURL (Playwright download events are unreliable for blob URLs),
// then fed back through Import to prove the round-trip is wired end-to-end.

test("UC-13/REQ-13.1,13.2: export then re-import round-trips a journey", async ({
  page,
}) => {
  await signup(page);
  const canvas = page.locator("main canvas");
  await waitCanvasReady(page);
  const box = (await canvas.boundingBox())!;

  // Create a goal so the export has content.
  await page.mouse.dblclick(Math.round(box.x + 150), Math.round(box.y + 150));

  // Capture the exported file's text by intercepting URL.createObjectURL.
  await page.evaluate(() => {
    (window as unknown as { __blob: string | null }).__blob = null;
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (obj: Blob | MediaSource) => {
      if (obj instanceof Blob) {
        obj.text().then((t) => {
          (window as unknown as { __blob: string | null }).__blob = t;
        });
      }
      return orig(obj);
    };
  });

  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.waitForFunction(
    () => (window as unknown as { __blob: string | null }).__blob !== null,
  );
  const text: string = await page.evaluate(
    () => (window as unknown as { __blob: string }).__blob,
  );

  // The export is a v2 journey carrying our goal.
  const payload = JSON.parse(text);
  expect(payload.type).toBe("journey");
  expect(payload.version).toBe(2);
  const goals = Object.values(payload.graph.nodes).filter(
    (n) => (n as { kind: string }).kind === "goal",
  );
  expect(goals).toHaveLength(1);

  // Re-import the same file -> a second journey is created.
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Import", exact: true }).click(),
  ]);
  await chooser.setFiles({
    name: "roundtrip.journey.json",
    mimeType: "application/json",
    buffer: Buffer.from(text),
  });

  await expect(page.locator("aside select option")).toHaveCount(2);
});
