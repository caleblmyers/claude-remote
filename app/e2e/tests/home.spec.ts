import { test, expect } from "@playwright/test";
import { resetState, fastLogin, seedTask } from "../helpers";

test.beforeEach(async ({ page }) => {
  await resetState();
  await fastLogin(page);
});

test("empty state shows prompt", async ({ page }) => {
  await expect(page.getByText(/no tasks yet/i)).toBeVisible();
});

test("task list renders active and completed tasks", async ({ page }) => {
  await seedTask({ id: "t1", repo: "my-project", status: "running", prompt: "Fix bugs" });
  await seedTask({ id: "t2", repo: "another-repo", status: "completed", prompt: "Run tests", summary: "All passed" });
  await page.reload();

  await expect(page.getByText("my-project")).toBeVisible();
  await expect(page.getByText("another-repo")).toBeVisible();
});

test("tap task navigates to detail", async ({ page }) => {
  const task = await seedTask({ id: "t1", repo: "my-project", status: "running" });
  await page.reload();

  await page.getByText("my-project").click();
  await page.waitForURL(`/tasks/${task.id}`);
  await expect(page).toHaveURL(`/tasks/${task.id}`);
});

test("task status updates via WebSocket", async ({ page }) => {
  const task = await seedTask({ id: "t1", repo: "my-project", status: "running" });
  await page.reload();
  await page.waitForTimeout(500); // wait for WS

  // Complete the task via control API — the WS event should update the UI
  const { completeTask } = await import("../helpers");
  await completeTask(task.id, "Done!");

  await expect(page.getByText(/completed/i)).toBeVisible({ timeout: 5000 });
});

test("new task button navigates to /new", async ({ page }) => {
  await page.getByRole("link", { name: /new task/i }).or(page.locator("a[href='/new']")).first().click();
  await page.waitForURL("/new");
  await expect(page).toHaveURL("/new");
});

test("settings button navigates to /settings", async ({ page }) => {
  await page.getByRole("link", { name: /settings/i }).or(page.locator("a[href='/settings']")).first().click();
  await page.waitForURL("/settings");
  await expect(page).toHaveURL("/settings");
});
