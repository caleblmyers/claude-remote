# Claude Remote — Agent SDK Integration

How the backend server uses the Claude Agent SDK to run tasks and bridge permissions to the phone.

## Core Flow

```
Phone sends task
    ↓
Backend creates Task record (SQLite)
    ↓
Backend calls Agent SDK query() with hooks
    ↓
Agent SDK executes Claude Code
    ↓
PreToolUse hook fires for each tool call
    ↓
Hook checks TrustLevel:
  - autoApprove → allow immediately
  - alwaysAsk → create PermissionRequest, push to phone, wait
  - deny → deny immediately
    ↓
Stream events forwarded to phone via WebSocket
    ↓
On completion → update Task, notify phone
```

## Implementation Sketch

### Task Execution

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

async function executeTask(task: Task, ws: WebSocket) {
  const trustLevel = task.trustLevel;

  const permissionHook = async (input: PreToolUseHookInput) => {
    const tool = input.tool_name;

    // Check trust level
    if (trustLevel.deny.includes(tool)) {
      return { hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "Blocked by trust level"
      }};
    }

    if (trustLevel.autoApprove.includes(tool)) {
      return { hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow"
      }};
    }

    // Needs phone approval
    const request = await db.createPermissionRequest({
      taskId: task.id,
      tool,
      input: input.tool_input,
      reasoning: extractReasoning(input)
    });

    // Notify phone
    ws.send(JSON.stringify({
      type: "task:permission",
      taskId: task.id,
      requestId: request.id,
      tool,
      input: input.tool_input,
      reasoning: request.reasoning
    }));

    // Send push notification
    await sendPushNotification({
      title: `Approval needed: ${tool}`,
      body: summarizeToolAction(tool, input.tool_input),
      data: { taskId: task.id, requestId: request.id }
    });

    // Wait for phone response (with timeout)
    const decision = await waitForApproval(request.id, 5 * 60 * 1000);

    return { hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision ? "allow" : "deny",
      permissionDecisionReason: decision ? undefined : "Denied by user"
    }};
  };

  try {
    for await (const message of query({
      prompt: task.prompt,
      options: {
        cwd: getRepoPath(task.repo),
        allowedTools: trustLevel.autoApprove,
        includePartialMessages: true,
        resume: task.sessionId || undefined,
        hooks: {
          PreToolUse: [{ hooks: [permissionHook] }]
        }
      }
    })) {
      // Capture session ID
      if (message.type === "system" && message.subtype === "init") {
        task.sessionId = message.session_id;
        await db.updateTask(task.id, { sessionId: message.session_id });
      }

      // Stream events to phone
      if (message.type === "stream_event") {
        ws.send(JSON.stringify({
          type: "task:stream",
          taskId: task.id,
          event: simplifyStreamEvent(message.event)
        }));
      }

      // Task complete
      if (message.type === "result") {
        await db.updateTask(task.id, {
          status: "completed",
          summary: message.result,
          updatedAt: new Date().toISOString()
        });
        ws.send(JSON.stringify({
          type: "task:complete",
          taskId: task.id,
          summary: message.result
        }));
      }
    }
  } catch (error) {
    await db.updateTask(task.id, {
      status: "failed",
      error: error.message,
      updatedAt: new Date().toISOString()
    });
    ws.send(JSON.stringify({
      type: "task:error",
      taskId: task.id,
      error: error.message
    }));
    await sendPushNotification({
      title: `Task failed: ${task.repo}`,
      body: error.message.slice(0, 100)
    });
  }
}
```

### Approval Waiting

```typescript
// Simple polling-based approval wait
function waitForApproval(requestId: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      const request = await db.getPermissionRequest(requestId);
      if (request.status === "approved") {
        clearInterval(interval);
        resolve(true);
      } else if (request.status === "denied") {
        clearInterval(interval);
        resolve(false);
      }
    }, 500); // check every 500ms

    setTimeout(() => {
      clearInterval(interval);
      resolve(false); // timeout = deny
    }, timeoutMs);
  });
}
```

### Stream Event Simplification

The raw Agent SDK events are verbose. Simplify for phone display:

```typescript
function simplifyStreamEvent(event: any) {
  // Text output
  if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
    return { type: "text", content: event.delta.text };
  }

  // Tool call starting
  if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
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

  return null; // skip other events
}
```

### Session Resumption

```typescript
// Resume a previous session from phone
async function resumeTask(taskId: string, message: string, ws: WebSocket) {
  const task = await db.getTask(taskId);
  if (!task.sessionId) throw new Error("No session to resume");

  // Update task status
  await db.updateTask(taskId, { status: "running" });

  // Resume with the stored session ID
  // The Agent SDK picks up full context from the previous session
  for await (const msg of query({
    prompt: message,
    options: {
      resume: task.sessionId,
      includePartialMessages: true,
      hooks: { /* same hooks as above */ }
    }
  })) {
    // same streaming logic
  }
}
```

## Key SDK Features Used

| Feature | Purpose | Status |
|---------|---------|--------|
| `query()` | Start/resume Claude Code sessions | Production |
| `includePartialMessages` | Real-time streaming to phone | Production |
| `PreToolUse` hooks | Permission bridging to phone | Production |
| `resume` option | Attach to running/previous sessions | Production |
| `allowedTools` | Pre-approve safe tool categories | Production |
| `cwd` option | Set working directory per repo | Production |

## Limitations & Workarounds

**Extended thinking disables streaming:** If a task uses `maxThinkingTokens`, you won't get incremental updates — only complete messages per turn. Workaround: don't enable extended thinking for tasks where live streaming matters.

**Permission timeout:** If the phone doesn't respond to a permission request within 5 minutes, the hook auto-denies. This prevents Claude from hanging indefinitely. The timeout is configurable.

**Session persistence:** Session IDs survive across query() calls. If the backend server restarts, sessions can be resumed as long as the session data is stored on disk (which Claude Code handles internally).
