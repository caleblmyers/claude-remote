import { test, expect } from "@playwright/test";
import { resetState } from "../helpers";

test.beforeEach(async ({ page }) => {
  await resetState(page);
});

test("shows login form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading")).toContainText(/claude remote/i);
  await expect(page.getByPlaceholder(/setup code/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /connect/i })).toBeVisible();
});

test("successful login redirects to home", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder(/setup code/i).fill("test-code");
  await page.getByRole("button", { name: /connect/i }).click();
  await page.waitForURL("/");
  await expect(page).toHaveURL("/");
});

test("invalid code shows error", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder(/setup code/i).fill("wrong-code");
  await page.getByRole("button", { name: /connect/i }).click();
  await expect(page.getByText(/invalid setup code/i)).toBeVisible();
});

test("unauthenticated access redirects to login", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL("/login");
  await expect(page).toHaveURL("/login");
});

test("unauthenticated task detail redirects to login", async ({ page }) => {
  await page.goto("/tasks/some-id");
  await page.waitForURL("/login");
  await expect(page).toHaveURL("/login");
});
