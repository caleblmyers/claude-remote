import {
  query,
  type HookInput,
  type HookJSONOutput,
  type SDKMessage,
  type SDKSystemMessage,
  type SDKPartialAssistantMessage,
  type SDKResultMessage,
  type SDKAssistantMessage,
} from "@anthropic-ai/claude-code";
import { v4 as uuidv4 } from "uuid";
import * as db from "../db";
import { broadcast } from "../ws";
import { getConfig } from "../config";
import {
  notifyPermissionRequest,
  notifyTaskComplete,
  notifyTaskError,
} from "../push";

// Track running tasks for abort/stop support
const runningTasks = new Map<string, AbortController>();

export function isTaskRunning(taskId: string): boolean {
  return runningTasks.has(taskId);
}

export function stopTask(taskId: string): boolean {
  const controller = runningTasks.get(taskId);
  if (!controller) return false;
  controller.abort();
  return true;
}

export function simplifyStreamEvent(
  event: any
): { type: string; content?: string; tool?: string } | null {
  // Text output
  if (
    event.type === "content_block_delta" &&
    event.delta?.type === "text_delta"
  ) {
    return { type: "text", content: event.delta.text };
  }

  // Tool call starting
  if (
    event.type === "content_block_start" &&
    event.content_block?.type === "tool_use"
  ) {
    return { type: "tool_start", tool: event.content_block.name };
  }

  // Tool call complete
  if (event.type === "content_block_stop") {
    return { type: "tool_end" };
  }

  // Message complete (turn done)
  if (event.type === "message_stop") {
    return { type: "turn_complete" };
  }

  return null;
}

function waitForApproval(
  requestId: string,
  timeoutMs: number = 5 * 60 * 1000
): Promise<boolean> {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const request = db.getPermissionRequest(requestId);
      if (!request) {
        clearInterval(interval);
        resolve(false);
        return;
      }
      if (request.status === "approved") {
        clearInterval(interval);
        resolve(true);
      } else if (request.status === "denied") {
        clearInterval(interval);
        resolve(false);
      }
    }, 500);

    setTimeout(() => {
      clearInterval(interval);
      db.resolvePermissionRequest(requestId, "denied");
      resolve(false);
    }, timeoutMs);
  });
}

function createPermissionHook(taskId: string, trustLevel: db.Task["trustLevel"]) {
  return async (
    input: HookInput,
    _toolUseID: string | undefined,
    _opts: { signal: AbortSignal }
  ): Promise<HookJSONOutput> => {
    if (input.hook_event_name !== "PreToolUse") return {};

    const tool = input.tool_name;

    // Check deny list
    if (trustLevel.deny?.includes(tool)) {
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "Blocked by trust level",
        },
      };
    }

    // Check auto-approve list
    if (trustLevel.autoApprove?.includes(tool)) {
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
        },
      };
    }

    // Needs phone approval
    const requestId = uuidv4();
    const toolInput =
      input.tool_input && typeof input.tool_input === "object"
        ? (input.tool_input as Record<string, unknown>)
        : {};

    const permRequest = db.createPermissionRequest({
      id: requestId,
      taskId,
      tool,
      input: toolInput,
      reasoning: undefined,
    });

    db.updateTask(taskId, { status: "waiting_approval" });
    broadcast({
      type: "task:permission",
      taskId,
      requestId: permRequest.id,
      tool,
      input: toolInput,
      reasoning: permRequest.reasoning,
    });
    broadcast({
      type: "task:status_change",
      taskId,
      oldStatus: "running",
      newStatus: "waiting_approval",
    });

    // Send push notification for permission request
    const task = db.getTask(taskId);
    notifyPermissionRequest(taskId, task?.repo ?? "", tool, toolInput).catch(
      () => {}
    );

    const approved = await waitForApproval(requestId);

    db.updateTask(taskId, { status: "running" });
    broadcast({
      type: "task:status_change",
      taskId,
      oldStatus: "waiting_approval",
      newStatus: "running",
    });

    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: approved ? "allow" : "deny",
        permissionDecisionReason: approved ? undefined : "Denied by user",
      },
    };
  };
}

function processMessage(taskId: string, message: SDKMessage): void {
  // Capture session ID from init
  if (message.type === "system") {
    const sys = message as SDKSystemMessage;
    if (sys.subtype === "init") {
      db.updateTask(taskId, { sessionId: sys.session_id });
    }
    return;
  }

  // Stream events (partial messages) → forward to phone
  if (message.type === "stream_event") {
    const partial = message as SDKPartialAssistantMessage;
    const simplified = simplifyStreamEvent(partial.event);
    if (simplified) {
      broadcast({
        type: "task:stream",
        taskId,
        event: simplified,
      });
    }
    return;
  }

  // Full assistant messages — extract content blocks
  if (message.type === "assistant") {
    const assist = message as SDKAssistantMessage;
    if (assist.message?.content && Array.isArray(assist.message.content)) {
      for (const block of assist.message.content) {
        if (block.type === "text") {
          broadcast({
            type: "task:stream",
            taskId,
            event: { type: "text", content: block.text },
          });
        } else if (block.type === "tool_use") {
          broadcast({
            type: "task:stream",
            taskId,
            event: { type: "tool_start", tool: block.name },
          });
        }
      }
    }
    return;
  }

  // Result — task complete
  if (message.type === "result") {
    const result = message as SDKResultMessage;
    const summary =
      result.subtype === "success" && "result" in result
        ? result.result
        : `Finished (${result.subtype})`;
    const costUsd = result.total_cost_usd;

    const taskForNotify = db.getTask(taskId);
    const repo = taskForNotify?.repo ?? "";

    db.updateTask(taskId, {
      status: result.is_error ? "failed" : "completed",
      summary,
      ...(result.is_error ? { error: summary } : {}),
    });
    broadcast({
      type: result.is_error ? "task:error" : "task:complete",
      taskId,
      ...(result.is_error ? { error: summary } : { summary }),
    });
    broadcast({
      type: "task:status_change",
      taskId,
      oldStatus: "running",
      newStatus: result.is_error ? "failed" : "completed",
    });

    // Send push notification
    if (result.is_error) {
      notifyTaskError(taskId, repo, summary).catch(() => {});
    } else {
      notifyTaskComplete(taskId, repo, summary).catch(() => {});
    }

    if (costUsd !== undefined) {
      console.log(`Task ${taskId} cost: $${costUsd.toFixed(4)}`);
    }
  }
}

export async function executeTask(taskId: string): Promise<void> {
  const task = db.getTask(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const config = getConfig();
  const repoConfig = config.repos.find((r) => r.name === task.repo);
  const cwd = repoConfig?.path ?? task.repo;
  const trustLevel = task.trustLevel;

  const controller = new AbortController();
  runningTasks.set(taskId, controller);

  db.updateTask(taskId, { status: "running" });
  broadcast({
    type: "task:status_change",
    taskId,
    oldStatus: "queued",
    newStatus: "running",
  });

  try {
    const messages = query({
      prompt: task.prompt,
      options: {
        cwd,
        allowedTools: trustLevel.autoApprove ?? [],
        abortController: controller,
        hooks: {
          PreToolUse: [
            { hooks: [createPermissionHook(taskId, trustLevel)] },
          ],
        },
        ...(task.sessionId ? { resume: task.sessionId } : {}),
      },
    });

    for await (const message of messages) {
      if (controller.signal.aborted) break;
      processMessage(taskId, message);
    }

    // If loop exited without a result (abort), mark stopped
    const finalTask = db.getTask(taskId);
    if (finalTask && finalTask.status === "running") {
      db.updateTask(taskId, { status: "stopped" });
      broadcast({
        type: "task:status_change",
        taskId,
        oldStatus: "running",
        newStatus: "stopped",
      });
    }
  } catch (error: any) {
    if (error.name === "AbortError" || controller.signal.aborted) {
      db.updateTask(taskId, { status: "stopped" });
      broadcast({
        type: "task:status_change",
        taskId,
        oldStatus: "running",
        newStatus: "stopped",
      });
    } else {
      const failedTask = db.getTask(taskId);
      db.updateTask(taskId, { status: "failed", error: error.message });
      broadcast({
        type: "task:error",
        taskId,
        error: error.message,
      });
      broadcast({
        type: "task:status_change",
        taskId,
        oldStatus: "running",
        newStatus: "failed",
      });
      notifyTaskError(taskId, failedTask?.repo ?? "", error.message).catch(
        () => {}
      );
    }
  } finally {
    runningTasks.delete(taskId);
  }
}

export async function replyToTask(
  taskId: string,
  message: string
): Promise<void> {
  const task = db.getTask(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  if (!task.sessionId) throw new Error("No session to resume");

  const config = getConfig();
  const repoConfig = config.repos.find((r) => r.name === task.repo);
  const cwd = repoConfig?.path ?? task.repo;
  const trustLevel = task.trustLevel;
  const controller = new AbortController();
  runningTasks.set(taskId, controller);

  db.updateTask(taskId, { status: "running" });
  broadcast({
    type: "task:status_change",
    taskId,
    oldStatus: task.status,
    newStatus: "running",
  });

  try {
    const messages = query({
      prompt: message,
      options: {
        cwd,
        allowedTools: trustLevel.autoApprove ?? [],
        abortController: controller,
        hooks: {
          PreToolUse: [
            { hooks: [createPermissionHook(taskId, trustLevel)] },
          ],
        },
        resume: task.sessionId,
      },
    });

    for await (const msg of messages) {
      if (controller.signal.aborted) break;
      processMessage(taskId, msg);
    }

    const finalTask = db.getTask(taskId);
    if (finalTask && finalTask.status === "running") {
      db.updateTask(taskId, { status: "completed" });
      broadcast({
        type: "task:status_change",
        taskId,
        oldStatus: "running",
        newStatus: "completed",
      });
    }
  } catch (error: any) {
    if (controller.signal.aborted) {
      db.updateTask(taskId, { status: "stopped" });
    } else {
      db.updateTask(taskId, { status: "failed", error: error.message });
      broadcast({
        type: "task:error",
        taskId,
        error: error.message,
      });
    }
  } finally {
    runningTasks.delete(taskId);
  }
}
