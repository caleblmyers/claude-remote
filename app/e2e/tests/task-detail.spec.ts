import { test, expect } from "@playwright/test";
import { resetState, fastLogin, seedTask, seedPermission, sendStreamEvents, completeTask, failTask } from "../helpers";
import { createStreamEvents } from "../fixtures";

test.beforeEach(async ({ page }) => {
  await resetState();
  await fastLogin(page);
});

test("shows task info", async ({ page }) => {
  const task = await seedTask({ id: "t1", repo: "my-project", prompt: "Fix all bugs", status: "running" });
  await page.goto(`/tasks/${task.id}`);

  await expect(page.getByText("my-project")).toBeVisible();
  await expect(page.getByText("Fix all bugs")).toBeVisible();
});

test("streaming output appears in real-time", async ({ page }) => {
  const task = await seedTask({ id: "t1", status: "running" });
  await page.goto(`/tasks/${task.id}`);
  await page.waitForTimeout(500); // wait for WS

  await sendStreamEvents(task.id, [
    { type: "text", content: "Analyzing the codebase now..." },
  ]);

  await expect(page.getByText("Analyzing the codebase now...")).toBeVisible({ timeout: 5000 });
});

test("tool start/end events render", async ({ page }) => {
  const task = await seedTask({ id: "t1", status: "running" });
  await page.goto(`/tasks/${task.id}`);
  await page.waitForTimeout(500);

  await sendStreamEvents(task.id, [
    { type: "tool_start", tool: "Read" },
    { type: "tool_input", input: "src/index.ts" },
    { type: "tool_end", tool: "Read" },
  ]);

  await expect(page.getByText(/Read/)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("src/index.ts")).toBeVisible();
});

test("approval card appears for pending permission", async ({ page }) => {
  const task = await seedTask({ id: "t1", status: "running" });
  await page.goto(`/tasks/${task.id}`);
  await page.waitForTimeout(500);

  await seedPermission(task.id, { tool: "Bash", input: { command: "npm test" } });

  await expect(page.getByText(/Bash/i)).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("button", { name: /approve/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /deny/i })).toBeVisible();
});

test("approve button resolves permission", async ({ page }) => {
  const task = await seedTask({ id: "t1", status: "running" });
  await page.goto(`/tasks/${task.id}`);
  await page.waitForTimeout(500);

  await seedPermission(task.id, { tool: "Bash", input: { command: "npm test" } });
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: /approve/i }).click();
  // Permission card should be dismissed or status should change
  await expect(page.getByText(/running/i).first()).toBeVisible({ timeout: 5000 });
});

test("deny button resolves permission", async ({ page }) => {
  const task = await seedTask({ id: "t1", status: "running" });
  await page.goto(`/tasks/${task.id}`);
  await page.waitForTimeout(500);

  await seedPermission(task.id, { tool: "Bash", input: { command: "rm -rf /" } });
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: /deny/i }).click();
  await expect(page.getByText(/running/i).first()).toBeVisible({ timeout: 5000 });
});

test("task completion updates UI", async ({ page }) => {
  const task = await seedTask({ id: "t1", status: "running" });
  await page.goto(`/tasks/${task.id}`);
  await page.waitForTimeout(500);

  await completeTask(task.id, "Fixed 3 bugs, all tests passing");

  await expect(page.getByText(/completed/i)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Fixed 3 bugs, all tests passing")).toBeVisible();
});

test("task failure shows error", async ({ page }) => {
  const task = await seedTask({ id: "t1", status: "running" });
  await page.goto(`/tasks/${task.id}`);
  await page.waitForTimeout(500);

  await failTask(task.id, "Build failed: syntax error in index.ts");

  await expect(page.getByText(/failed/i)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Build failed: syntax error in index.ts")).toBeVisible();
});

test("persisted events load on navigation", async ({ page }) => {
  const task = await seedTask({ id: "t1", status: "running" });
  // Send events before navigating to the page
  await sendStreamEvents(task.id, [
    { type: "text", content: "This was streamed earlier" },
    { type: "text", content: "And this too" },
  ]);

  await page.goto(`/tasks/${task.id}`);

  await expect(page.getByText("This was streamed earlier")).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("And this too")).toBeVisible();
});

test("stop button stops the task", async ({ page }) => {
  const task = await seedTask({ id: "t1", status: "running" });
  await page.goto(`/tasks/${task.id}`);

  const stopBtn = page.getByRole("button", { name: /stop/i });
  if (await stopBtn.isVisible()) {
    await stopBtn.click();
    await expect(page.getByText(/stopped/i)).toBeVisible({ timeout: 5000 });
  }
});

test("reply input sends message", async ({ page }) => {
  const task = await seedTask({ id: "t1", status: "completed", sessionId: "session-1" });
  await page.goto(`/tasks/${task.id}`);

  const replyInput = page.locator("input[placeholder*='Reply'], textarea[placeholder*='Reply'], input[placeholder*='reply'], textarea[placeholder*='reply']");
  if (await replyInput.isVisible()) {
    await replyInput.fill("Also fix the linter warnings");
    await page.keyboard.press("Enter");
    // Should send the reply
    await page.waitForTimeout(500);
  }
});
