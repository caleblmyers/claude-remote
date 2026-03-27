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
import { execSync } from "child_process";
import { v4 as uuidv4 } from "uuid";
import * as db from "../db";
import { saveTaskEvent } from "../db";
import { broadcast } from "../ws";
import { getConfig } from "../config";
import {
  notifyPermissionRequest,
  notifyTaskComplete,
  notifyTaskError,
} from "../push";

interface FileDiff {
  path: string;
  diff: string;
  additions: number;
  deletions: number;
}

function captureGitDiffs(cwd: string): FileDiff[] {
  try {
    const raw = execSync("git diff HEAD~1", { cwd, encoding: "utf-8", maxBuffer: 5 * 1024 * 1024 });
    if (!raw.trim()) return [];

    const fileDiffs: FileDiff[] = [];
    // Split by "diff --git" to get per-file chunks
    const chunks = raw.split(/^diff --git /m).filter(Boolean);

    for (const chunk of chunks) {
      const fullChunk = "diff --git " + chunk;
      // Extract file path from "diff --git a/path b/path"
      const pathMatch = chunk.match(/^a\/(.+?) b\//);
      const filePath = pathMatch ? pathMatch[1] : "unknown";

      let additions = 0;
      let deletions = 0;
      for (const line of fullChunk.split("\n")) {
        if (line.startsWith("+") && !line.startsWith("+++")) additions++;
        if (line.startsWith("-") && !line.startsWith("---")) deletions++;
      }

      fileDiffs.push({ path: filePath, diff: fullChunk, additions, deletions });
    }

    return fileDiffs;
  } catch {
    return [];
  }
}

// Track running tasks for abort/stop support
const runningTasks = new Map<string, AbortController>();

// Track content block types per task for correct tool_end detection
// Maps taskId -> (contentBlockIndex -> blockType)
const taskStreamState = new Map<string, Map<number, string>>();

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
  event: any,
  blockTypes?: Map<number, string>
): { type: string; content?: string; tool?: string; input?: string } | null {
  // Track content block types on start
  if (event.type === "content_block_start") {
    const index = event.index as number;
    const blockType = event.content_block?.type as string;
    if (blockTypes && index !== undefined) {
      blockTypes.set(index, blockType);
    }

    // Tool call starting
    if (blockType === "tool_use") {
      return { type: "tool_start", tool: event.content_block.name };
    }

    // Text and thinking blocks start silently (content comes via deltas)
    return null;
  }

  // Text output
  if (
    event.type === "content_block_delta" &&
    event.delta?.type === "text_delta"
  ) {
    return { type: "text", content: event.delta.text };
  }

  // Tool input streaming — show tool arguments as they arrive
  if (
    event.type === "content_block_delta" &&
    event.delta?.type === "input_json_delta"
  ) {
    return { type: "tool_input", input: event.delta.partial_json };
  }

  // Content block complete — only emit tool_end for tool_use blocks
  if (event.type === "content_block_stop") {
    const index = event.index as number;
    const blockType = blockTypes?.get(index);
    if (blockType === "tool_use") {
      return { type: "tool_end" };
    }
    // Text/thinking block stop — no visible event needed
    return null;
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
    console.log(`[hook] PreToolUse: tool=${tool}, input keys=${Object.keys(input.tool_input ?? {}).join(",")}`);

    // Internal Claude Code tools — auto-approve, these aren't user-facing
    const internalTools = ["TodoWrite", "TodoRead", "KillShell", "BashOutput", "TaskCreate", "TaskUpdate", "TaskGet", "TaskList", "TaskOutput", "TaskStop"];
    if (internalTools.includes(tool)) {
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
        },
      };
    }

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
  const msg = message as any;
  console.log(`[sdk] message type=${msg.type} subtype=${msg.subtype ?? ""}`);

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
    // Get or create block type tracking for this task
    if (!taskStreamState.has(taskId)) {
      taskStreamState.set(taskId, new Map());
    }
    const blockTypes = taskStreamState.get(taskId)!;

    // Reset block tracking on message_start (new turn)
    if (partial.event && (partial.event as any).type === "message_start") {
      blockTypes.clear();
    }

    const simplified = simplifyStreamEvent(partial.event, blockTypes);
    if (simplified) {
      saveTaskEvent(taskId, simplified.type, JSON.stringify(simplified));
      broadcast({
        type: "task:stream",
        taskId,
        event: simplified,
      });
    }
    return;
  }

  // Full assistant messages — skip, already covered by stream_event deltas
  if (message.type === "assistant") {
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

    // Capture git diffs on successful completion
    let diffs: FileDiff[] = [];
    if (!result.is_error && taskForNotify) {
      const config = getConfig();
      const repoConfig = config.repos.find((r) => r.name === taskForNotify.repo);
      const cwd = repoConfig?.path ?? taskForNotify.repo;
      diffs = captureGitDiffs(cwd);
    }

    db.updateTask(taskId, {
      status: result.is_error ? "failed" : "completed",
      summary,
      ...(result.is_error ? { error: summary } : {}),
      ...(diffs.length > 0 ? { diffs } : {}),
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
    taskStreamState.delete(taskId);
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
    taskStreamState.delete(taskId);
  }
}
