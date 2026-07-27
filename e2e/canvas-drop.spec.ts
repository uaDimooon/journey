import { test, expect } from "@playwright/test";
import { signup, waitCanvasReady } from "./helpers";

// Flagship E2E: dragging a trait onto another goal reassigns it (UC-9/REQ-9.2).
// Uses the deterministic window.__journeyTest bridge to target a goal's REAL
// screen position, and a synthetic HTML5 DragEvent (Playwright's mouse-based DnD
// does not drive native drag-and-drop). See docs/TESTING.md.

test("UC-9/REQ-9.2: drag a trait onto another goal reassigns it (Move)", async ({
  page,
}) => {
  await signup(page);
  const canvas = page.locator("main canvas");
  await waitCanvasReady(page);
  const box = (await canvas.boundingBox())!;

  // Create two goals by double-clicking two empty grid points. Each new goal is
  // auto-selected, so we read its id from the bridge rather than guessing where
  // it snapped to on the grid.
  const pA = { x: Math.round(box.x + 150), y: Math.round(box.y + 150) };
  const pB = { x: Math.round(box.x + 360), y: Math.round(box.y + 380) };
  const selectedId = () =>
    page.evaluate(
      () => (window as unknown as { __journeyTest: any }).__journeyTest.selectedId(),
    );

  await page.mouse.dblclick(pA.x, pA.y);
  const idA = await selectedId();
  await page.mouse.dblclick(pB.x, pB.y);
  const idB = await selectedId();

  expect(idA).toBeTruthy();
  expect(idB).toBeTruthy();
  expect(idA).not.toBe(idB);

  // Goal B (created last) is selected — add a trait to it via the panel.
  await page.getByPlaceholder("Add a trait…").fill("Focus");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Focus")).toBeVisible();

  // Synthetic HTML5 drag of the trait onto goal A's real screen position.
  const posA = await page.evaluate(
    (id) => (window as unknown as { __journeyTest: any }).__journeyTest.screenPosOf(id),
    idA,
  );
  const dialogText = await page.evaluate(async (pt: { x: number; y: number }) => {
    const row = Array.from(
      document.querySelectorAll('aside div[draggable="true"]'),
    ).find((d) => d.textContent?.includes("Focus"));
    const cv = document.querySelector("main canvas");
    if (!row || !cv) return null;
    const dt = new DataTransfer();
    const fire = (el: Element, type: string, extra: Record<string, unknown> = {}) =>
      el.dispatchEvent(
        new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, ...extra }),
      );
    fire(row, "dragstart");
    await new Promise((r) => setTimeout(r, 60));
    const at = { clientX: pt.x, clientY: pt.y };
    fire(cv, "dragover", at);
    fire(cv, "drop", at);
    await new Promise((r) => setTimeout(r, 80));
    const m = document.body.innerText.match(/Move or copy[^\n]*/);
    return m ? m[0] : null;
  }, posA);

  // The reassign dialog names the trait and the target goal.
  expect(dialogText).toContain("Move or copy");
  expect(dialogText).toContain("Focus");

  await page.getByRole("button", { name: "Move", exact: true }).click();

  // Select goal A at its real position; it now holds the moved trait.
  const posA2 = await page.evaluate(
    (id) => (window as unknown as { __journeyTest: any }).__journeyTest.screenPosOf(id),
    idA,
  );
  await page.mouse.click(posA2.x, posA2.y);
  await expect(page.getByText("Focus")).toBeVisible();
});
