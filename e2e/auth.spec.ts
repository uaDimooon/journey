import { test, expect } from "@playwright/test";
import { signup } from "./helpers";

test("UC-1/REQ-1.1: a user can sign up and land in the app", async ({ page }) => {
  await signup(page);
  await expect(page.locator("main canvas")).toBeVisible();
});
