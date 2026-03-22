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
  type: "text" | "tool_start" | "tool_end" | "turn_complete";
  content?: string;
  tool?: string;
}

// ── Trust level presets ───────────────────────────────────────────────────────

export const TRUST_PRESETS = {
  "read-only": {
    label: "Read only",
    description: "Safest — only browsing, no changes",
    trustLevel: {
      autoApprove: ["Read", "Grep", "Glob"],
      alwaysAsk: ["Bash", "Write", "Edit"],
      deny: [],
    },
  },
  "edit-freely": {
    label: "Edit freely",
    description: "Can read and edit files, asks for shell",
    trustLevel: {
      autoApprove: ["Read", "Grep", "Glob", "Edit"],
      alwaysAsk: ["Bash", "Write"],
      deny: [],
    },
  },
  "full-auto": {
    label: "Full auto",
    description: "Fastest — auto-approves everything",
    trustLevel: {
      autoApprove: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],
      alwaysAsk: [],
      deny: [],
    },
  },
} as const;

export type TrustPresetKey = keyof typeof TRUST_PRESETS | "custom";

export const ALL_TOOLS = ["Read", "Grep", "Glob", "Edit", "Write", "Bash"] as const;
