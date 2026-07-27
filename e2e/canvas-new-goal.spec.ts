import { test, expect } from "@playwright/test";
import { signup, waitCanvasReady } from "./helpers";

// UC-10: dropping a trait on empty canvas creates a new goal (Copy/Move first).
// Uses a synthetic HTML5 drag to an empty point far from any node.

test("UC-10/REQ-10.2: dropping a trait on empty canvas creates a new goal", async ({
  page,
}) => {
  await signup(page);
  const canvas = page.locator("main canvas");
  await waitCanvasReady(page);
  const box = (await canvas.boundingBox())!;

  // Create a goal and give it a trait.
  await page.mouse.dblclick(Math.round(box.x + 150), Math.round(box.y + 150));
  await page.getByPlaceholder("Add a trait…").fill("Focus");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Focus")).toBeVisible();

  // Drag the trait onto an empty corner of the canvas.
  const empty = {
    x: Math.round(box.x + box.width - 60),
    y: Math.round(box.y + box.height - 60),
  };
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
  }, empty);

  expect(dialogText).toContain("into a new goal");
  await page.getByRole("button", { name: "Move", exact: true }).click();

  // The source goal lost the trait (moved out)…
  await expect(page.getByText("No traits yet.")).toBeVisible();
  // …and a second goal now exists (both carry the default "New goal" name).
  await page.getByRole("button", { name: "← All items" }).click();
  await expect(page.getByRole("button", { name: "New goal" })).toHaveCount(2);
});
