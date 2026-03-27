import type { Task, RepoConfig, RepoTemplate, TrustLevel } from "./types";

const BASE_URL = "/api";

function getToken(): string | null {
  return localStorage.getItem("claude-remote-token");
}

export function setToken(token: string): void {
  localStorage.setItem("claude-remote-token", token);
}

export function clearToken(): void {
  localStorage.removeItem("claude-remote-token");
}

export function hasToken(): boolean {
  return !!localStorage.getItem("claude-remote-token");
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers,
    ...options,
  });

  if (res.status === 401 && path !== "/auth/login") {
    clearToken();
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (res.status === 401) {
    throw new Error("Unauthorized (401)");
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `API ${options?.method ?? "GET"} ${path} failed (${res.status}): ${body}`
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface TaskWithPermissions extends Task {
  pendingPermissions?: import("./types").PermissionRequest[];
}

export interface FileDiff {
  path: string;
  diff: string;
  additions: number;
  deletions: number;
}

export interface TaskEvent {
  id: number;
  taskId: string;
  eventType: string;
  data: string;
  createdAt: string;
}

export interface ActivityEntry {
  id: number;
  action: string;
  taskId?: string;
  detail?: Record<string, unknown>;
  createdAt: string;
}

export const api = {
  tasks: {
    list: () => request<Task[]>("/tasks"),
    get: (id: string) => request<TaskWithPermissions>(`/tasks/${id}`),
    create: (payload: {
      repo: string;
      prompt: string;
      trustLevel?: TrustLevel;
    }) =>
      request<Task>("/tasks", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    stop: (id: string) =>
      request<{ success: boolean }>(`/tasks/${id}/stop`, { method: "POST" }),
    resume: (id: string, message: string) =>
      request<{ success: boolean }>(`/tasks/${id}/resume`, {
        method: "POST",
        body: JSON.stringify({ message }),
      }),
    events: (id: string) => request<TaskEvent[]>(`/tasks/${id}/events`),
    diffs: (id: string) => request<FileDiff[]>(`/tasks/${id}/diffs`),
    delete: (id: string) =>
      request<void>(`/tasks/${id}`, { method: "DELETE" }),
    approve: (taskId: string, requestId: string) =>
      request<{ success: boolean }>(`/tasks/${taskId}/approve`, {
        method: "POST",
        body: JSON.stringify({ requestId }),
      }),
    deny: (taskId: string, requestId: string, reason?: string) =>
      request<{ success: boolean }>(`/tasks/${taskId}/deny`, {
        method: "POST",
        body: JSON.stringify({ requestId, reason }),
      }),
    reply: (taskId: string, message: string) =>
      request<{ success: boolean }>(`/tasks/${taskId}/reply`, {
        method: "POST",
        body: JSON.stringify({ message }),
      }),
  },

  repos: {
    list: () => request<RepoConfig[]>("/repos"),
    templates: (repo?: string) =>
      request<{ global: RepoTemplate[]; repo: RepoTemplate[] }>(
        `/templates${repo ? `?repo=${encodeURIComponent(repo)}` : ""}`
      ),
  },

  config: {
    get: () => request<Record<string, unknown>>("/config"),
    update: (updates: Record<string, unknown>) =>
      request<Record<string, unknown>>("/config", {
        method: "PUT",
        body: JSON.stringify(updates),
      }),
  },

  push: {
    vapidKey: () => request<{ publicKey: string }>("/push/vapid-key"),
    status: () => request<{ configured: boolean }>("/push/status"),
    subscribe: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
      request<{ success: boolean }>("/push/subscribe", {
        method: "POST",
        body: JSON.stringify(subscription),
      }),
    test: () =>
      request<{ sent: number; failed: number }>("/push/test", { method: "POST" }),
    unsubscribe: (endpoint: string) =>
      request<{ success: boolean }>("/push/subscribe", {
        method: "DELETE",
        body: JSON.stringify({ endpoint }),
      }),
  },

  admin: {
    stats: () =>
      request<{ activeConnections: number; uptime: number; tasksToday: number }>("/admin/stats"),
  },

  activity: {
    list: (limit = 50, offset = 0) =>
      request<ActivityEntry[]>(`/activity?limit=${limit}&offset=${offset}`),
  },

  escalate: (taskId: string, tool: string) =>
    request<{ success: boolean; trustLevel: TrustLevel }>(`/tasks/${taskId}/escalate`, {
      method: "POST",
      body: JSON.stringify({ tool }),
    }),

  auth: {
    login: (code: string) =>
      request<{ token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ code }),
      }),
  },

  health: {
    check: () => request<{ status: string; timestamp: string }>("/health"),
  },
};
