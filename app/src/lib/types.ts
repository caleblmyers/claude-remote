// ── Domain types (mirrors backend data model) ─────────────────────────────────

export type TaskStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "stopped";

export interface TrustLevel {
  autoApprove: string[];
  alwaysAsk: string[];
  deny: string[];
}

export interface Task {
  id: string;
  repo: string;
  prompt: string;
  status: TaskStatus;
  trustLevel: TrustLevel;
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

export interface RepoTemplate {
  name: string;
  prompt: string;
  trustLevel?: Partial<TrustLevel>;
}

export interface RepoConfig {
  name: string;
  path: string;
  templates?: RepoTemplate[];
}

// ── WebSocket event types ─────────────────────────────────────────────────────

export type WsServerEvent =
  | { type: "task:created"; taskId: string; repo: string; prompt: string; status: TaskStatus }
  | { type: "task:progress"; taskId: string; step: string; summary: string; detail?: string }
  | { type: "task:stream"; taskId: string; event: StreamEvent }
  | { type: "task:permission"; taskId: string; requestId: string; tool: string; input: Record<string, unknown>; reasoning?: string }
  | { type: "task:complete"; taskId: string; summary: string; filesChanged?: string[] }
  | { type: "task:error"; taskId: string; error: string; context?: string }
  | { type: "task:status_change"; taskId?: string; oldStatus?: TaskStatus; newStatus?: TaskStatus; connected?: boolean };

export interface StreamEvent {
  type: "text" | "tool_start" | "tool_input" | "tool_end" | "turn_complete";
  content?: string;
  tool?: string;
  input?: string;
}

// ── Trust level presets ───────────────────────────────────────────────────────

export const TRUST_PRESETS = {
  "observe": {
    label: "Observe",
    description: "Read-only — can browse code, can't change anything",
    trustLevel: {
      autoApprove: ["Read", "Grep", "Glob"],
      alwaysAsk: [],
      deny: ["Bash", "Write", "Edit"],
    },
  },
  "code": {
    label: "Code",
    description: "Can read and edit files, asks before running commands",
    trustLevel: {
      autoApprove: ["Read", "Grep", "Glob", "Edit", "Write"],
      alwaysAsk: ["Bash"],
      deny: [],
    },
  },
  "auto": {
    label: "Auto",
    description: "Full autonomy — no approvals needed",
    trustLevel: {
      autoApprove: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],
      alwaysAsk: [],
      deny: [],
    },
  },
} as const;

export type TrustPresetKey = keyof typeof TRUST_PRESETS | "custom";

export const ALL_TOOLS = ["Read", "Grep", "Glob", "Edit", "Write", "Bash"] as const;
