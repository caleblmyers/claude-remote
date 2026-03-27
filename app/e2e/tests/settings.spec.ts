import { test, expect } from "@playwright/test";
import { resetState, fastLogin } from "../helpers";

test.beforeEach(async ({ page }) => {
  await resetState();
  await fastLogin(page);
  await page.goto("/settings");
});

test("shows repos from config", async ({ page }) => {
  await expect(page.getByText("my-project")).toBeVisible();
  await expect(page.getByText("another-repo")).toBeVisible();
});

test("shows global templates", async ({ page }) => {
  await expect(page.getByText(/run tests/i).first()).toBeVisible();
  await expect(page.getByText(/code review/i).first()).toBeVisible();
});

test("disconnect/logout redirects to login", async ({ page }) => {
  const logoutBtn = page.getByRole("button", { name: /disconnect|logout|sign out/i });
  await logoutBtn.click();
  await page.waitForURL("/login");
  await expect(page).toHaveURL("/login");
});
