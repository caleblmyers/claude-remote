import webpush from "web-push";
import * as db from "../db";
import { getConfig } from "../config";

let vapidConfigured = false;

export function initVapid(): void {
  if (vapidConfigured) return;

  const config = getConfig();

  if (config.vapid?.publicKey && config.vapid?.privateKey) {
    webpush.setVapidDetails(
      config.vapid.mailto || "mailto:claude-remote@localhost",
      config.vapid.publicKey,
      config.vapid.privateKey
    );
    vapidConfigured = true;
    console.log("VAPID keys configured for push notifications");
  } else {
    console.warn(
      "No VAPID keys configured. Push notifications are disabled.\n" +
      "Generate keys with: npx web-push generate-vapid-keys\n" +
      "Then add them to claude-remote.config.yaml under 'vapid:'"
    );
  }
}

export function getVapidPublicKey(): string | null {
  const config = getConfig();
  return config.vapid?.publicKey ?? null;
}

function summarizeToolAction(
  tool: string,
  input: Record<string, unknown>
): string {
  if (tool === "Bash" && input.command) return `$ ${input.command}`;
  if ((tool === "Edit" || tool === "Write") && input.file_path)
    return `${tool}: ${input.file_path}`;
  return `${tool}`;
}

export async function sendPushToAll(payload: {
  title: string;
  body: string;
  tag?: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  if (!vapidConfigured) return;

  const config = getConfig();
  const notifications = config.defaults?.notifications;

  // Check notification preferences
  if (payload.tag === "permission" && notifications && !notifications.onPermission) return;
  if (payload.tag === "complete" && notifications && !notifications.onComplete) return;
  if (payload.tag === "error" && notifications && !notifications.onError) return;

  const subscriptions = db.listPushSubscriptions();
  if (subscriptions.length === 0) return;

  const jsonPayload = JSON.stringify(payload);

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: sub.keys,
        },
        jsonPayload
      );
    } catch (err: any) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        // Subscription expired, remove it
        db.deletePushSubscription(sub.endpoint);
      } else {
        console.error("Push notification failed:", err.message);
      }
    }
  }
}

export async function notifyPermissionRequest(
  taskId: string,
  repo: string,
  tool: string,
  input: Record<string, unknown>
): Promise<void> {
  await sendPushToAll({
    title: `Approval needed: ${tool}`,
    body: `${repo} — ${summarizeToolAction(tool, input)}`,
    tag: "permission",
    data: { url: `/tasks/${taskId}`, taskId },
  });
}

export async function notifyTaskComplete(
  taskId: string,
  repo: string,
  summary: string
): Promise<void> {
  await sendPushToAll({
    title: `Task complete: ${repo}`,
    body: summary.slice(0, 120),
    tag: "complete",
    data: { url: `/tasks/${taskId}`, taskId },
  });
}

export async function notifyTaskError(
  taskId: string,
  repo: string,
  error: string
): Promise<void> {
  await sendPushToAll({
    title: `Task failed: ${repo}`,
    body: error.slice(0, 120),
    tag: "error",
    data: { url: `/tasks/${taskId}`, taskId },
  });
}
