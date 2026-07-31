import { test, expect } from "@playwright/test";
import { signup } from "./helpers";

// On phones the panel is an off-canvas drawer, so the canvas is usable.
test.use({ viewport: { width: 390, height: 844 } }); // iPhone-ish

test("UC-5: on mobile the panel is a toggleable drawer", async ({ page }) => {
  await signup(page);

  // Drawer starts closed → the open (☰) button is shown.
  const openBtn = page.getByRole("button", { name: "Open panel" });
  await expect(openBtn).toBeVisible();

  // Open it → overview content + close button appear.
  await openBtn.click();
  await expect(page.getByRole("button", { name: "Close panel" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  // Close via the ✕ button → back to the open button.
  await page.getByRole("button", { name: "Close panel" }).click();
  await expect(openBtn).toBeVisible();

  // Backdrop tap also closes it.
  await openBtn.click();
  await page.mouse.click(370, 400); // outside the drawer (right edge)
  await expect(openBtn).toBeVisible();
});
