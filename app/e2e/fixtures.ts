// Test data factories for mock server

import type { Task, PermissionRequest, RepoConfig, RepoTemplate, StreamEvent, TrustLevel, TaskStatus } from "../src/lib/types";

let idCounter = 0;
function nextId(): string {
  return `test-${++idCounter}`;
}

export function resetIds(): void {
  idCounter = 0;
}

export function createTask(overrides: Partial<Task> = {}): Task {
  const id = overrides.id ?? nextId();
  return {
    id,
    repo: "my-project",
    prompt: "Run the test suite and fix failures",
    status: "running" as TaskStatus,
    trustLevel: {
      autoApprove: ["Read", "Grep", "Glob", "Edit", "Write"],
      alwaysAsk: ["Bash"],
      deny: [],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createPermission(taskId: string, overrides: Partial<PermissionRequest> = {}): PermissionRequest {
  return {
    id: overrides.id ?? nextId(),
    taskId,
    tool: "Bash",
    input: { command: "npm test" },
    reasoning: "Need to run the test suite to check for failures",
    status: "pending",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createStreamEvents(): StreamEvent[] {
  return [
    { type: "text", content: "I'll start by reading the test files to understand the current test suite." },
    { type: "tool_start", tool: "Read" },
    { type: "tool_input", input: "src/__tests__/index.test.ts" },
    { type: "tool_end", tool: "Read" },
    { type: "text", content: "Found 3 test files. Let me run the test suite." },
    { type: "tool_start", tool: "Bash" },
    { type: "tool_input", input: "npm test" },
    { type: "tool_end", tool: "Bash" },
    { type: "text", content: "All 12 tests passing. The suite is clean." },
    { type: "turn_complete" },
  ];
}

export const MOCK_REPOS: RepoConfig[] = [
  {
    name: "my-project",
    path: "/home/user/projects/my-project",
    templates: [
      { name: "Run tests", prompt: "Run the test suite and report results" },
      { name: "Fix lint", prompt: "Fix all lint errors" },
    ],
  },
  {
    name: "another-repo",
    path: "/home/user/projects/another-repo",
  },
];

export const MOCK_GLOBAL_TEMPLATES: RepoTemplate[] = [
  {
    name: "Run tests",
    prompt: "Run the test suite and fix any failures",
    trustLevel: { autoApprove: ["Read", "Grep", "Glob", "Bash"], alwaysAsk: ["Edit", "Write"], deny: [] },
  },
  {
    name: "Code review",
    prompt: "Review recent changes for bugs, security issues, and style",
    trustLevel: { autoApprove: ["Read", "Grep", "Glob"], alwaysAsk: ["Bash", "Edit", "Write"], deny: [] },
  },
];

export const MOCK_CONFIG = {
  repos: MOCK_REPOS,
  globalTemplates: MOCK_GLOBAL_TEMPLATES,
  defaults: {
    trustLevel: {
      autoApprove: ["Read", "Grep", "Glob", "Edit", "Write"],
      alwaysAsk: ["Bash"],
      deny: [],
    },
    notifications: {
      onComplete: true,
      onError: true,
      onPermission: true,
    },
  },
};
