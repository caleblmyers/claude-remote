import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import * as db from "../db";
import { getConfig, updateConfig } from "../config";
import { executeTask, stopTask, replyToTask, isTaskRunning } from "../agent";
import { issueToken, validateSetupCode } from "../auth";
import { broadcast } from "../ws";
import { getVapidPublicKey } from "../push";

const router: Router = Router();

// -- Health -------------------------------------------------------------------

router.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// -- Tasks --------------------------------------------------------------------

router.get("/tasks", (_req: Request, res: Response) => {
  const tasks = db.listTasks();
  res.json(tasks);
});

router.get("/tasks/:id", (req: Request, res: Response) => {
  const task = db.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  // Include pending permissions in the response
  const pendingPermissions = db.listPendingPermissions(task.id);
  res.json({ ...task, pendingPermissions });
});

router.post("/tasks", (req: Request, res: Response) => {
  const { repo, prompt, trustLevel } = req.body as {
    repo?: string;
    prompt?: string;
    trustLevel?: db.Task["trustLevel"];
  };

  if (!repo || !prompt) {
    return res.status(400).json({ error: "repo and prompt are required" });
  }

  const config = getConfig();
  const defaultTrust = config.defaults.trustLevel;

  const task = db.createTask({
    id: uuidv4(),
    repo,
    prompt,
    status: "queued",
    trustLevel: trustLevel ?? defaultTrust,
  });

  // Broadcast task creation
  broadcast({
    type: "task:created",
    taskId: task.id,
    repo: task.repo,
    prompt: task.prompt,
    status: task.status,
  });

  // Kick off agent execution in background (don't await)
  executeTask(task.id).catch((err) => {
    console.error(`Task ${task.id} execution failed:`, err.message);
  });

  res.status(201).json(task);
});

router.post("/tasks/:id/stop", (req: Request, res: Response) => {
  const task = db.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  if (isTaskRunning(task.id)) {
    stopTask(task.id);
  } else if (!["completed", "failed", "stopped"].includes(task.status)) {
    db.updateTask(task.id, { status: "stopped" });
    broadcast({
      type: "task:status_change",
      taskId: task.id,
      oldStatus: task.status,
      newStatus: "stopped",
    });
  }

  res.json({ success: true });
});

router.post("/tasks/:id/resume", (req: Request, res: Response) => {
  const task = db.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (!task.sessionId) {
    return res.status(400).json({ error: "No session to resume" });
  }

  // Resume is essentially a reply with a continuation prompt
  const { message } = req.body as { message?: string };
  replyToTask(task.id, message || "Continue where you left off.").catch(
    (err) => {
      console.error(`Resume task ${task.id} failed:`, err.message);
    }
  );

  res.json({ success: true });
});

router.delete("/tasks/:id", (req: Request, res: Response) => {
  // Stop if running
  if (isTaskRunning(req.params.id)) {
    stopTask(req.params.id);
  }
  db.deleteTask(req.params.id);
  res.status(204).send();
});

// -- Approvals ----------------------------------------------------------------

router.post("/tasks/:id/approve", (req: Request, res: Response) => {
  const { requestId } = req.body as { requestId?: string };
  if (!requestId)
    return res.status(400).json({ error: "requestId is required" });

  const perm = db.getPermissionRequest(requestId);
  if (!perm || perm.taskId !== req.params.id) {
    return res.status(404).json({ error: "Permission request not found" });
  }

  db.resolvePermissionRequest(requestId, "approved");
  res.json({ success: true });
});

router.post("/tasks/:id/deny", (req: Request, res: Response) => {
  const { requestId } = req.body as { requestId?: string };
  if (!requestId)
    return res.status(400).json({ error: "requestId is required" });

  const perm = db.getPermissionRequest(requestId);
  if (!perm || perm.taskId !== req.params.id) {
    return res.status(404).json({ error: "Permission request not found" });
  }

  db.resolvePermissionRequest(requestId, "denied");
  res.json({ success: true });
});

router.post("/tasks/:id/reply", (req: Request, res: Response) => {
  const task = db.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const { message } = req.body as { message?: string };
  if (!message) return res.status(400).json({ error: "message is required" });

  replyToTask(task.id, message).catch((err) => {
    console.error(`Reply to task ${task.id} failed:`, err.message);
  });

  res.json({ success: true });
});

// -- Repos & Templates --------------------------------------------------------

router.get("/repos", (_req: Request, res: Response) => {
  const config = getConfig();
  res.json(config.repos);
});

router.get("/templates", (req: Request, res: Response) => {
  const config = getConfig();
  const { repo } = req.query as { repo?: string };

  const globalTemplates = config.globalTemplates ?? [];
  if (!repo) return res.json({ global: globalTemplates, repo: [] });

  const repoConfig = config.repos.find((r) => r.name === repo);
  res.json({ global: globalTemplates, repo: repoConfig?.templates ?? [] });
});

// -- Trust Level Escalation ---------------------------------------------------

const KNOWN_TOOLS = ["Read", "Write", "Edit", "Bash", "Grep", "Glob", "Agent", "WebSearch", "WebFetch", "NotebookEdit"];

router.post("/tasks/:id/escalate", (req: Request, res: Response) => {
  const task = db.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const { tool } = req.body as { tool?: string };
  if (!tool) return res.status(400).json({ error: "tool is required" });

  if (!KNOWN_TOOLS.includes(tool)) {
    return res.status(400).json({ error: "Unknown tool" });
  }

  // Cannot escalate tools on the deny list
  const trustLevel = { ...task.trustLevel };
  if (trustLevel.deny.includes(tool)) {
    return res.status(403).json({ error: "Tool is on the deny list and cannot be escalated" });
  }

  if (!trustLevel.autoApprove.includes(tool)) {
    trustLevel.autoApprove = [...trustLevel.autoApprove, tool];
  }
  trustLevel.alwaysAsk = trustLevel.alwaysAsk.filter((t) => t !== tool);

  db.updateTask(req.params.id, { trustLevel });
  res.json({ success: true, trustLevel });
});

// -- Push Notifications -------------------------------------------------------

router.get("/push/vapid-key", (_req: Request, res: Response) => {
  const key = getVapidPublicKey();
  if (!key) {
    return res.status(404).json({ error: "VAPID not configured" });
  }
  res.json({ publicKey: key });
});

router.post("/push/subscribe", (req: Request, res: Response) => {
  const { endpoint, keys } = req.body as {
    endpoint?: string;
    keys?: { p256dh: string; auth: string };
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: "Invalid push subscription" });
  }

  db.savePushSubscription({ endpoint, keys });
  res.json({ success: true });
});

// -- Config -------------------------------------------------------------------

router.get("/config", (_req: Request, res: Response) => {
  const config = getConfig();
  const { auth: _auth, vapid: _vapid, server: _server, ...safe } = config;
  void _auth; void _vapid; void _server;
  res.json(safe);
});

router.put("/config", (req: Request, res: Response) => {
  const updates = req.body as Record<string, unknown>;
  if (!updates || typeof updates !== "object") {
    return res.status(400).json({ error: "Invalid config update" });
  }

  // Don't allow changing auth or server settings from the phone
  delete updates.auth;
  delete updates.server;

  try {
    // Also block vapid and server changes from the phone
    delete updates.vapid;

    const updated = updateConfig(updates);
    const { auth: _auth, vapid: _vapid, server: _server, ...safe } = updated;
    void _auth; void _vapid; void _server;
    res.json(safe);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -- Auth ---------------------------------------------------------------------

router.post("/auth/login", (req: Request, res: Response) => {
  const { code } = req.body as { code?: string };
  if (!code) {
    return res.status(400).json({ error: "Setup code is required" });
  }

  if (!validateSetupCode(code)) {
    return res.status(401).json({ error: "Invalid setup code" });
  }

  const token = issueToken();
  res.json({ token });
});

export default router;
