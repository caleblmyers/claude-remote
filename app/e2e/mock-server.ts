// Mock backend server for e2e tests
// Mimics the real API surface with in-memory state, controllable via a side-channel API on port 3099

import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import {
  createTask,
  createPermission,
  MOCK_REPOS,
  MOCK_GLOBAL_TEMPLATES,
  MOCK_CONFIG,
  resetIds,
} from "./fixtures";
import type { Task, PermissionRequest, StreamEvent } from "../src/lib/types";
import type { TaskEvent } from "../src/lib/api";

// ── In-memory state ──────────────────────────────────────────────────────────

interface State {
  tasks: Task[];
  permissions: PermissionRequest[];
  events: Map<string, TaskEvent[]>;
  config: typeof MOCK_CONFIG;
}

let state: State = freshState();

function freshState(): State {
  return {
    tasks: [],
    permissions: [],
    events: new Map(),
    config: JSON.parse(JSON.stringify(MOCK_CONFIG)),
  };
}

// ── WebSocket clients ────────────────────────────────────────────────────────

const wsClients = new Set<WebSocket>();

function broadcast(event: Record<string, unknown>): void {
  const data = JSON.stringify(event);
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

// ── Mock API server (port 3000) ──────────────────────────────────────────────

const app = express();
app.use(express.json());

// Auth middleware
app.use("/api", (req, res, next) => {
  if (req.path === "/auth/login" || req.path === "/health") return next();
  const auth = req.headers.authorization;
  if (!auth || auth !== "Bearer mock-jwt") {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

// Health
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Auth
app.post("/api/auth/login", (req, res) => {
  const { code } = req.body;
  if (code === "test-code") {
    return res.json({ token: "mock-jwt" });
  }
  res.status(401).json({ error: "Invalid setup code" });
});

// Tasks
app.get("/api/tasks", (_req, res) => {
  res.json(state.tasks);
});

app.get("/api/tasks/:id", (req, res) => {
  const task = state.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  const pendingPermissions = state.permissions.filter(
    (p) => p.taskId === task.id && p.status === "pending"
  );
  res.json({ ...task, pendingPermissions });
});

app.get("/api/tasks/:id/events", (req, res) => {
  const task = state.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json(state.events.get(task.id) ?? []);
});

app.post("/api/tasks", (req, res) => {
  const { repo, prompt, trustLevel } = req.body;
  if (!repo || !prompt) {
    return res.status(400).json({ error: "repo and prompt are required" });
  }
  if (typeof prompt !== "string" || prompt.length < 1 || prompt.length > 10000) {
    return res.status(400).json({ error: "Prompt must be between 1 and 10000 characters" });
  }
  const task = createTask({
    repo,
    prompt,
    status: "queued",
    ...(trustLevel && { trustLevel }),
  });
  state.tasks.unshift(task);
  broadcast({ type: "task:created", taskId: task.id, repo, prompt, status: "queued" });
  res.status(201).json(task);
});

app.post("/api/tasks/:id/stop", (req, res) => {
  const task = state.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  const oldStatus = task.status;
  task.status = "stopped";
  task.updatedAt = new Date().toISOString();
  broadcast({ type: "task:status_change", taskId: task.id, oldStatus, newStatus: "stopped" });
  res.json({ success: true });
});

app.post("/api/tasks/:id/resume", (req, res) => {
  const task = state.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json({ success: true });
});

app.delete("/api/tasks/:id", (req, res) => {
  state.tasks = state.tasks.filter((t) => t.id !== req.params.id);
  state.permissions = state.permissions.filter((p) => p.taskId !== req.params.id);
  state.events.delete(req.params.id);
  res.status(204).send();
});

app.post("/api/tasks/:id/approve", (req, res) => {
  const { requestId } = req.body;
  const perm = state.permissions.find((p) => p.id === requestId);
  if (!perm) return res.status(404).json({ error: "Permission not found" });
  perm.status = "approved";
  perm.resolvedAt = new Date().toISOString();
  const task = state.tasks.find((t) => t.id === req.params.id);
  if (task && task.status === "waiting_approval") {
    task.status = "running";
    task.updatedAt = new Date().toISOString();
    broadcast({ type: "task:status_change", taskId: task.id, oldStatus: "waiting_approval", newStatus: "running" });
  }
  res.json({ success: true });
});

app.post("/api/tasks/:id/deny", (req, res) => {
  const { requestId } = req.body;
  const perm = state.permissions.find((p) => p.id === requestId);
  if (!perm) return res.status(404).json({ error: "Permission not found" });
  perm.status = "denied";
  perm.resolvedAt = new Date().toISOString();
  const task = state.tasks.find((t) => t.id === req.params.id);
  if (task && task.status === "waiting_approval") {
    task.status = "running";
    task.updatedAt = new Date().toISOString();
    broadcast({ type: "task:status_change", taskId: task.id, oldStatus: "waiting_approval", newStatus: "running" });
  }
  res.json({ success: true });
});

app.post("/api/tasks/:id/reply", (req, res) => {
  const task = state.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json({ success: true });
});

app.post("/api/tasks/:id/escalate", (req, res) => {
  const task = state.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  const { tool } = req.body;
  if (!task.trustLevel.autoApprove.includes(tool)) {
    task.trustLevel.autoApprove.push(tool);
    task.trustLevel.alwaysAsk = task.trustLevel.alwaysAsk.filter((t) => t !== tool);
  }
  res.json({ success: true, trustLevel: task.trustLevel });
});

// Repos & templates
app.get("/api/repos", (_req, res) => {
  res.json(state.config.repos);
});

app.get("/api/templates", (req, res) => {
  const repoName = req.query.repo as string | undefined;
  const repoConfig = repoName
    ? state.config.repos.find((r) => r.name === repoName)
    : undefined;
  res.json({
    global: state.config.globalTemplates,
    repo: repoConfig?.templates ?? [],
  });
});

// Config
app.get("/api/config", (_req, res) => {
  res.json(state.config);
});

app.put("/api/config", (req, res) => {
  Object.assign(state.config, req.body);
  res.json(state.config);
});

// Push (stubs)
app.get("/api/push/vapid-key", (_req, res) => {
  res.status(404).json({ error: "Push not configured" });
});

app.get("/api/push/status", (_req, res) => {
  res.json({ configured: false });
});

app.post("/api/push/subscribe", (_req, res) => {
  res.json({ success: true });
});

app.post("/api/push/test", (_req, res) => {
  res.json({ sent: 0, failed: 0 });
});

app.delete("/api/push/subscribe", (_req, res) => {
  res.json({ success: true });
});

// ── HTTP + WebSocket server ──────────────────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const token = url.searchParams.get("token");
  if (token !== "mock-jwt") {
    ws.close(4001, "Unauthorized");
    return;
  }
  wsClients.add(ws);
  ws.send(JSON.stringify({ type: "task:status_change", connected: true }));

  ws.on("close", () => {
    wsClients.delete(ws);
  });

  // Handle ping/pong for keep-alive
  ws.on("pong", () => {});
});

// Server-side heartbeat
setInterval(() => {
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.ping();
    }
  }
}, 30_000);

// ── Control API (port 3099) ──────────────────────────────────────────────────

const controlApp = express();
controlApp.use(express.json());

controlApp.post("/reset", (_req, res) => {
  state = freshState();
  resetIds();
  // Close all WS clients
  for (const client of wsClients) {
    client.close();
  }
  wsClients.clear();
  res.json({ ok: true });
});

controlApp.post("/tasks", (req, res) => {
  const task = createTask(req.body);
  state.tasks.unshift(task);
  res.json(task);
});

controlApp.post("/tasks/:id/permission", (req, res) => {
  const task = state.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  const perm = createPermission(task.id, req.body);
  state.permissions.push(perm);
  task.status = "waiting_approval";
  task.updatedAt = new Date().toISOString();
  broadcast({
    type: "task:permission",
    taskId: task.id,
    requestId: perm.id,
    tool: perm.tool,
    input: perm.input,
    reasoning: perm.reasoning,
  });
  broadcast({
    type: "task:status_change",
    taskId: task.id,
    oldStatus: "running",
    newStatus: "waiting_approval",
  });
  res.json(perm);
});

controlApp.post("/tasks/:id/stream", (req, res) => {
  const task = state.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  const events: StreamEvent[] = req.body.events ?? [];
  const taskEvents = state.events.get(task.id) ?? [];
  for (const event of events) {
    const taskEvent: TaskEvent = {
      id: taskEvents.length + 1,
      taskId: task.id,
      eventType: event.type,
      data: JSON.stringify(event),
      createdAt: new Date().toISOString(),
    };
    taskEvents.push(taskEvent);
    broadcast({ type: "task:stream", taskId: task.id, event });
  }
  state.events.set(task.id, taskEvents);
  res.json({ ok: true, count: events.length });
});

controlApp.post("/tasks/:id/complete", (req, res) => {
  const task = state.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  task.status = "completed";
  task.summary = req.body.summary ?? "Task completed successfully";
  task.filesChanged = req.body.filesChanged ?? [];
  task.sessionId = req.body.sessionId ?? "session-1";
  task.updatedAt = new Date().toISOString();
  broadcast({
    type: "task:complete",
    taskId: task.id,
    summary: task.summary,
    filesChanged: task.filesChanged,
  });
  res.json(task);
});

controlApp.post("/tasks/:id/error", (req, res) => {
  const task = state.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  task.status = "failed";
  task.error = req.body.error ?? "Something went wrong";
  task.updatedAt = new Date().toISOString();
  broadcast({
    type: "task:error",
    taskId: task.id,
    error: task.error!,
  });
  res.json(task);
});

controlApp.post("/broadcast", (req, res) => {
  broadcast(req.body);
  res.json({ ok: true });
});

controlApp.get("/state", (_req, res) => {
  res.json({
    tasks: state.tasks,
    permissions: state.permissions,
    events: Object.fromEntries(state.events),
  });
});

// ── Start servers ────────────────────────────────────────────────────────────

const MOCK_PORT = parseInt(process.env.MOCK_PORT ?? "3111", 10);
const CONTROL_PORT = parseInt(process.env.CONTROL_PORT ?? "3099", 10);

server.listen(MOCK_PORT, () => {
  console.log(`Mock API server running on http://localhost:${MOCK_PORT}`);
});

controlApp.listen(CONTROL_PORT, () => {
  console.log(`Control API running on http://localhost:${CONTROL_PORT}`);
});
