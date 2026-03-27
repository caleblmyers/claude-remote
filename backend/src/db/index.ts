import Database from "better-sqlite3";
import path from "path";
import { initSchema } from "./schema";

export interface Task {
  id: string;
  repo: string;
  prompt: string;
  status: "queued" | "running" | "waiting_approval" | "completed" | "failed" | "stopped";
  trustLevel: {
    autoApprove: string[];
    alwaysAsk: string[];
    deny: string[];
  };
  sessionId?: string;
  summary?: string;
  filesChanged?: string[];
  diffs?: Array<{ path: string; diff: string; additions: number; deletions: number }>;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskEvent {
  id: number;
  taskId: string;
  eventType: string;
  data: unknown;
  createdAt: string;
}

export interface PermissionRequest {
  id: string;
  taskId: string;
  tool: string;
  input: Record<string, unknown>;
  reasoning?: string;
  status: "pending" | "approved" | "denied";
  createdAt: string;
  resolvedAt?: string;
}

export interface ActivityEntry {
  id: number;
  action: string;
  taskId?: string;
  detail?: Record<string, unknown>;
  createdAt: string;
}

type ActivityRow = {
  id: number;
  action: string;
  task_id: string | null;
  detail: string | null;
  created_at: string;
};

type TaskRow = {
  id: string;
  repo: string;
  prompt: string;
  status: Task["status"];
  trust_level: string;
  session_id: string | null;
  summary: string | null;
  files_changed: string | null;
  diffs: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

type TaskEventRow = {
  id: number;
  task_id: string;
  event_type: string;
  data: string;
  created_at: string;
};

type PermRow = {
  id: string;
  task_id: string;
  tool: string;
  input: string;
  reasoning: string | null;
  status: PermissionRequest["status"];
  created_at: string;
  resolved_at: string | null;
};

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    const dbPath = path.resolve(process.cwd(), "claude-remote.db");
    _db = new Database(dbPath);
    initSchema(_db);
    // Clean up stale tasks from previous server runs
    _db.prepare(
      "UPDATE tasks SET status = 'stopped', updated_at = ? WHERE status IN ('running', 'waiting_approval', 'queued')"
    ).run(new Date().toISOString());
  }
  return _db;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    repo: row.repo,
    prompt: row.prompt,
    status: row.status,
    trustLevel: JSON.parse(row.trust_level),
    sessionId: row.session_id ?? undefined,
    summary: row.summary ?? undefined,
    filesChanged: row.files_changed ? JSON.parse(row.files_changed) : undefined,
    diffs: row.diffs ? JSON.parse(row.diffs) : undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPerm(row: PermRow): PermissionRequest {
  return {
    id: row.id,
    taskId: row.task_id,
    tool: row.tool,
    input: JSON.parse(row.input),
    reasoning: row.reasoning ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
  };
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export function createTask(task: Omit<Task, "createdAt" | "updatedAt">): Task {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO tasks (id, repo, prompt, status, trust_level, session_id, summary, files_changed, diffs, error, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    task.id,
    task.repo,
    task.prompt,
    task.status,
    JSON.stringify(task.trustLevel),
    task.sessionId ?? null,
    task.summary ?? null,
    task.filesChanged ? JSON.stringify(task.filesChanged) : null,
    task.diffs ? JSON.stringify(task.diffs) : null,
    task.error ?? null,
    now,
    now,
  );
  return { ...task, createdAt: now, updatedAt: now };
}

export function getTask(id: string): Task | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
  return row ? rowToTask(row) : undefined;
}

export function listTasks(): Task[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM tasks ORDER BY updated_at DESC LIMIT 50"
  ).all() as TaskRow[];
  return rows.map(rowToTask);
}

export function countTasksToday(): number {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const row = db.prepare(
    "SELECT COUNT(*) as count FROM tasks WHERE created_at >= ?"
  ).get(`${today}T00:00:00.000Z`) as { count: number };
  return row.count;
}

export function updateTask(id: string, updates: Partial<Omit<Task, "id" | "createdAt">>): void {
  const db = getDb();
  const now = new Date().toISOString();
  const fields: string[] = ["updated_at = ?"];
  const values: unknown[] = [now];

  if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status); }
  if (updates.sessionId !== undefined) { fields.push("session_id = ?"); values.push(updates.sessionId); }
  if (updates.summary !== undefined) { fields.push("summary = ?"); values.push(updates.summary); }
  if (updates.filesChanged !== undefined) { fields.push("files_changed = ?"); values.push(JSON.stringify(updates.filesChanged)); }
  if (updates.diffs !== undefined) { fields.push("diffs = ?"); values.push(JSON.stringify(updates.diffs)); }
  if (updates.error !== undefined) { fields.push("error = ?"); values.push(updates.error); }
  if (updates.trustLevel !== undefined) { fields.push("trust_level = ?"); values.push(JSON.stringify(updates.trustLevel)); }

  values.push(id);
  db.prepare(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteTask(id: string): void {
  getDb().prepare("DELETE FROM tasks WHERE id = ?").run(id);
}

export function listRunningTasksByRepo(repo: string): Task[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM tasks WHERE repo = ? AND status IN ('running', 'waiting_approval')"
  ).all(repo) as TaskRow[];
  return rows.map(rowToTask);
}

export function getOldestQueuedTask(repo: string): Task | undefined {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM tasks WHERE repo = ? AND status = 'queued' ORDER BY created_at ASC LIMIT 1"
  ).get(repo) as TaskRow | undefined;
  return row ? rowToTask(row) : undefined;
}

export function getQueuePosition(taskId: string): number {
  const db = getDb();
  const task = db.prepare("SELECT repo, created_at FROM tasks WHERE id = ? AND status = 'queued'").get(taskId) as { repo: string; created_at: string } | undefined;
  if (!task) return 0;
  const count = db.prepare(
    "SELECT COUNT(*) as cnt FROM tasks WHERE repo = ? AND status = 'queued' AND created_at < ?"
  ).get(task.repo, task.created_at) as { cnt: number };
  return count.cnt + 1;
}

// ── Task Events ──────────────────────────────────────────────────────────────

function rowToTaskEvent(row: TaskEventRow): TaskEvent {
  return {
    id: row.id,
    taskId: row.task_id,
    eventType: row.event_type,
    data: JSON.parse(row.data),
    createdAt: row.created_at,
  };
}

export function saveTaskEvent(taskId: string, eventType: string, data: string): number {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO task_events (task_id, event_type, data, created_at)
    VALUES (?, ?, ?, ?)
  `).run(taskId, eventType, data, now);
  return Number(result.lastInsertRowid);
}

export function listTaskEvents(taskId: string): TaskEvent[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM task_events WHERE task_id = ? ORDER BY id ASC"
  ).all(taskId) as TaskEventRow[];
  return rows.map(rowToTaskEvent);
}

// ── Permission Requests ───────────────────────────────────────────────────────

export function createPermissionRequest(
  req: Omit<PermissionRequest, "status" | "createdAt" | "resolvedAt">
): PermissionRequest {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO permission_requests (id, task_id, tool, input, reasoning, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).run(req.id, req.taskId, req.tool, JSON.stringify(req.input), req.reasoning ?? null, now);
  return { ...req, status: "pending", createdAt: now };
}

export function getPermissionRequest(id: string): PermissionRequest | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM permission_requests WHERE id = ?").get(id) as PermRow | undefined;
  return row ? rowToPerm(row) : undefined;
}

export function resolvePermissionRequest(id: string, status: "approved" | "denied"): void {
  const db = getDb();
  db.prepare(
    "UPDATE permission_requests SET status = ?, resolved_at = ? WHERE id = ?"
  ).run(status, new Date().toISOString(), id);
}

export function listPendingPermissions(taskId: string): PermissionRequest[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM permission_requests WHERE task_id = ? AND status = 'pending' ORDER BY created_at ASC"
  ).all(taskId) as PermRow[];
  return rows.map(rowToPerm);
}

// ── Push Subscriptions ───────────────────────────────────────────────────────

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function savePushSubscription(sub: PushSubscriptionRecord): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO push_subscriptions (endpoint, keys_p256dh, keys_auth, created_at)
    VALUES (?, ?, ?, ?)
  `).run(sub.endpoint, sub.keys.p256dh, sub.keys.auth, new Date().toISOString());
}

export function listPushSubscriptions(): PushSubscriptionRecord[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM push_subscriptions").all() as {
    endpoint: string;
    keys_p256dh: string;
    keys_auth: string;
  }[];
  return rows.map((r) => ({
    endpoint: r.endpoint,
    keys: { p256dh: r.keys_p256dh, auth: r.keys_auth },
  }));
}

export function deletePushSubscription(endpoint: string): void {
  getDb().prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
}

// ── Activity Log ─────────────────────────────────────────────────────────────

function rowToActivityEntry(row: ActivityRow): ActivityEntry {
  return {
    id: row.id,
    action: row.action,
    taskId: row.task_id ?? undefined,
    detail: row.detail ? JSON.parse(row.detail) : undefined,
    createdAt: row.created_at,
  };
}

export function logActivity(action: string, taskId?: string, detail?: Record<string, unknown>): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO activity_log (action, task_id, detail, created_at)
    VALUES (?, ?, ?, ?)
  `).run(action, taskId ?? null, detail ? JSON.stringify(detail) : null, new Date().toISOString());
}

export function listActivityLog(limit = 50, offset = 0): ActivityEntry[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ? OFFSET ?"
  ).all(limit, offset) as ActivityRow[];
  return rows.map(rowToActivityEntry);
}
