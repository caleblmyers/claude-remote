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
  error?: string;
  createdAt: string;
  updatedAt: string;
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

type TaskRow = {
  id: string;
  repo: string;
  prompt: string;
  status: Task["status"];
  trust_level: string;
  session_id: string | null;
  summary: string | null;
  files_changed: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
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
    INSERT INTO tasks (id, repo, prompt, status, trust_level, session_id, summary, files_changed, error, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    task.id,
    task.repo,
    task.prompt,
    task.status,
    JSON.stringify(task.trustLevel),
    task.sessionId ?? null,
    task.summary ?? null,
    task.filesChanged ? JSON.stringify(task.filesChanged) : null,
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

export function updateTask(id: string, updates: Partial<Omit<Task, "id" | "createdAt">>): void {
  const db = getDb();
  const now = new Date().toISOString();
  const fields: string[] = ["updated_at = ?"];
  const values: unknown[] = [now];

  if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status); }
  if (updates.sessionId !== undefined) { fields.push("session_id = ?"); values.push(updates.sessionId); }
  if (updates.summary !== undefined) { fields.push("summary = ?"); values.push(updates.summary); }
  if (updates.filesChanged !== undefined) { fields.push("files_changed = ?"); values.push(JSON.stringify(updates.filesChanged)); }
  if (updates.error !== undefined) { fields.push("error = ?"); values.push(updates.error); }
  if (updates.trustLevel !== undefined) { fields.push("trust_level = ?"); values.push(JSON.stringify(updates.trustLevel)); }

  values.push(id);
  db.prepare(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteTask(id: string): void {
  getDb().prepare("DELETE FROM tasks WHERE id = ?").run(id);
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
