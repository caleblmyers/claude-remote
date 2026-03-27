import { test, expect } from "@playwright/test";
import { resetState, fastLogin, seedTask } from "../helpers";

test.beforeEach(async () => {
  await resetState();
});

test("auth guard redirects unauthenticated to login", async ({ page }) => {
  await page.goto("/settings");
  await page.waitForURL("/login");
  await expect(page).toHaveURL("/login");
});

test("unknown route redirects to home", async ({ page }) => {
  await fastLogin(page);
  await page.goto("/nonexistent-page");
  await page.waitForURL("/");
  await expect(page).toHaveURL("/");
});

test("deep link to task detail works after login", async ({ page }) => {
  const task = await seedTask({ id: "t1", repo: "my-project", status: "running" });
  await fastLogin(page);
  await page.goto(`/tasks/${task.id}`);
  await expect(page.getByText("my-project")).toBeVisible();
});

test("navigate to new task and back preserves home state", async ({ page }) => {
  await seedTask({ id: "t1", repo: "my-project", status: "running" });
  await fastLogin(page);
  await expect(page.getByText("my-project")).toBeVisible();

  // Navigate to new task
  await page.goto("/new");
  await page.waitForURL("/new");

  // Go back
  await page.goBack();
  await page.waitForURL("/");
  await expect(page.getByText("my-project")).toBeVisible();
});
