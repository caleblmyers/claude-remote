// Shared test helpers for Playwright e2e tests

import type { Page } from "@playwright/test";
import type { Task, PermissionRequest, StreamEvent } from "../src/lib/types";

const CONTROL_URL = "http://localhost:3099";

// ── Control API helpers ──────────────────────────────────────────────────────

async function controlPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${CONTROL_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  return res.json() as Promise<T>;
}

export async function resetState(page?: Page): Promise<void> {
  await controlPost("/reset");
  if (page) {
    await page.evaluate(() => localStorage.clear());
  }
}

export async function seedTask(overrides: Partial<Task> = {}): Promise<Task> {
  return controlPost<Task>("/tasks", overrides);
}

export async function seedPermission(
  taskId: string,
  overrides: Partial<PermissionRequest> = {}
): Promise<PermissionRequest> {
  return controlPost<PermissionRequest>(`/tasks/${taskId}/permission`, overrides);
}

export async function sendStreamEvents(
  taskId: string,
  events: StreamEvent[]
): Promise<void> {
  await controlPost(`/tasks/${taskId}/stream`, { events });
}

export async function completeTask(
  taskId: string,
  summary = "Task completed successfully",
  filesChanged: string[] = []
): Promise<void> {
  await controlPost(`/tasks/${taskId}/complete`, { summary, filesChanged, sessionId: "session-1" });
}

export async function failTask(taskId: string, error = "Something went wrong"): Promise<void> {
  await controlPost(`/tasks/${taskId}/error`, { error });
}

export async function broadcastWsEvent(event: Record<string, unknown>): Promise<void> {
  await controlPost("/broadcast", event);
}

// ── Page helpers ─────────────────────────────────────────────────────────────

/** Fast login by injecting the token before the app loads */
export async function fastLogin(page: Page): Promise<void> {
  // Set token before app renders so AuthGuard sees it on first mount
  await page.goto("/login");
  await page.evaluate(() => {
    localStorage.setItem("claude-remote-token", "mock-jwt");
  });
  // Full page reload so React re-initializes with the token present
  await page.goto("/");
  await page.waitForURL("/", { timeout: 10_000 });
}

/** Full login through the UI (for login-specific tests) */
export async function loginViaUI(page: Page, code = "test-code"): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder(/setup code/i).fill(code);
  await page.getByRole("button", { name: /connect/i }).click();
}

/** Wait for WebSocket connection to be established */
export async function waitForWsConnected(page: Page): Promise<void> {
  // The app shows a connection dot - wait for it to indicate connected
  await page.waitForTimeout(500);
}

/** Simulate pull-to-refresh touch gesture */
export async function pullToRefresh(page: Page): Promise<void> {
  const box = await page.locator("main, [data-testid='task-list'], .min-h-screen").first().boundingBox();
  if (!box) return;
  const startX = box.x + box.width / 2;
  const startY = box.y + 20;
  await page.touchscreen.tap(startX, startY);
  // Simulate swipe down
  await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return;
    el.dispatchEvent(new TouchEvent("touchstart", {
      touches: [new Touch({ identifier: 0, target: el, clientX: x, clientY: y })],
      bubbles: true,
    }));
    el.dispatchEvent(new TouchEvent("touchmove", {
      touches: [new Touch({ identifier: 0, target: el, clientX: x, clientY: y + 80 })],
      bubbles: true,
    }));
    el.dispatchEvent(new TouchEvent("touchend", {
      changedTouches: [new Touch({ identifier: 0, target: el, clientX: x, clientY: y + 80 })],
      bubbles: true,
    }));
  }, { x: startX, y: startY });
}
