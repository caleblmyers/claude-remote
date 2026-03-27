import { test, expect } from "@playwright/test";
import { resetState, fastLogin } from "../helpers";

test.beforeEach(async ({ page }) => {
  await resetState();
  await fastLogin(page);
  await page.goto("/new");
});

test("shows repo selection step", async ({ page }) => {
  await expect(page.getByText("my-project")).toBeVisible();
  await expect(page.getByText("another-repo")).toBeVisible();
});

test("selecting repo advances to input step", async ({ page }) => {
  await page.getByText("my-project").click();
  await expect(page.locator("textarea")).toBeVisible();
});

test("templates load for selected repo", async ({ page }) => {
  await page.getByText("my-project").click();
  // Should see repo-specific templates or global templates
  await expect(page.getByText(/run tests/i).first()).toBeVisible();
});

test("template click fills prompt", async ({ page }) => {
  await page.getByText("my-project").click();
  await page.getByText(/run tests/i).first().click();
  const textarea = page.locator("textarea");
  await expect(textarea).not.toBeEmpty();
});

test("trust level selector shows presets", async ({ page }) => {
  await page.getByText("my-project").click();
  await expect(page.getByText(/observe/i)).toBeVisible();
  await expect(page.getByText(/code/i).first()).toBeVisible();
  await expect(page.getByText(/auto/i)).toBeVisible();
});

test("empty prompt disables submit", async ({ page }) => {
  await page.getByText("my-project").click();
  const textarea = page.locator("textarea");
  await expect(textarea).toBeEmpty();
  // The submit/send button should be disabled
  const submitBtn = page.getByRole("button", { name: /send|start|submit/i });
  await expect(submitBtn).toBeDisabled();
});

test("prompt character count shown", async ({ page }) => {
  await page.getByText("my-project").click();
  const textarea = page.locator("textarea");
  await textarea.fill("Hello world");
  // Should show character count somewhere
  await expect(page.getByText(/11/)).toBeVisible();
});

test("successful task creation navigates to task detail", async ({ page }) => {
  await page.getByText("my-project").click();
  await page.locator("textarea").fill("Fix all the bugs");
  await page.getByRole("button", { name: /send|start|submit/i }).click();
  // Should navigate to the new task detail page
  await page.waitForURL(/\/tasks\//);
  await expect(page.url()).toContain("/tasks/");
});
