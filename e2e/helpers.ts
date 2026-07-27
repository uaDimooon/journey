import { expect, type Page } from "@playwright/test";

/** Sign up a fresh, unique user and wait until the app has loaded. */
export async function signup(page: Page): Promise<string> {
  const email = `e2e_${Date.now()}_${Math.random().toString(36).slice(2)}@journey.test`;
  await page.goto("/");
  await page.getByRole("button", { name: /no account\? sign up/i }).click();
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: /log out/i })).toBeVisible();
  return email;
}
