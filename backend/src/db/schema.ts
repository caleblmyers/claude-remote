import Database from "better-sqlite3";

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,
  repo         TEXT NOT NULL,
  prompt       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued','running','waiting_approval','completed','failed','stopped')),
  trust_level  TEXT NOT NULL DEFAULT '{}',   -- JSON: TrustLevel
  session_id   TEXT,
  summary      TEXT,
  files_changed TEXT,                         -- JSON: string[]
  diffs        TEXT,                          -- JSON: FileDiff[]
  error        TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS permission_requests (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tool         TEXT NOT NULL,
  input        TEXT NOT NULL DEFAULT '{}',    -- JSON: Record<string, unknown>
  reasoning    TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','denied')),
  created_at   TEXT NOT NULL,
  resolved_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_status       ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at   ON tasks(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_perm_task_id       ON permission_requests(task_id);
CREATE INDEX IF NOT EXISTS idx_perm_status        ON permission_requests(status);

CREATE TABLE IF NOT EXISTS task_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  data         TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_events_task_id ON task_events(task_id);

CREATE INDEX IF NOT EXISTS idx_tasks_repo_status ON tasks(repo, status);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint     TEXT NOT NULL UNIQUE,
  keys_p256dh  TEXT NOT NULL,
  keys_auth    TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  action       TEXT NOT NULL
                 CHECK (action IN ('login','login_failed','task_created','task_completed','task_failed','task_stopped','permission_approved','permission_denied','trust_escalated','config_updated')),
  task_id      TEXT,
  detail       TEXT,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_task_id    ON activity_log(task_id);
`;

export function initSchema(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
}
