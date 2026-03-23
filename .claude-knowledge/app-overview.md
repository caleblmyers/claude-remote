# Claude Remote — App Overview

Mobile controller for Claude Code. A PWA + Node.js backend that lets you start tasks, stream output, and handle permission approvals from your phone.

## Architecture

```
Phone (PWA)  ──WebSocket──  Backend (Node.js)  ──Agent SDK──  Claude Code
                            Runs on desktop via Tailscale
```

- **Phone app:** Vite + React + TypeScript PWA (port 5174)
- **Backend:** Node.js + Express + TypeScript (port 3000)
- **Claude integration:** `@anthropic-ai/claude-code` Agent SDK with `PreToolUse` hooks
- **Database:** SQLite via `better-sqlite3`
- **Networking:** Tailscale mesh VPN (phone <-> desktop)
- **Realtime:** WebSocket (ws library) for streaming task events
- **Auth:** JWT token-based (HMAC-derived signing key, 7-day expiry)

## Request Flow

1. Phone sends HTTP request to Vite dev server (port 5174)
2. Vite proxies `/api/*` to backend (port 3000)
3. Backend auth middleware validates JWT
4. Route handler processes request
5. For task creation: spawns Claude Code via Agent SDK's `query()` function
6. SDK streams messages back; backend broadcasts simplified events via WebSocket
7. Phone receives events and renders real-time output

## WebSocket Flow

- Phone connects to `ws://<tailscale-ip>:3000?token=<jwt>`
- Backend authenticates connection, adds to client list
- Events: `task:created`, `task:stream`, `task:permission`, `task:complete`, `task:error`, `task:status_change`
- Auto-reconnect with exponential backoff (1s, 2s, 4s... max 15s)

## Permission Bridging

When Claude Code wants to use a tool (Bash, Edit, Write):
1. `PreToolUse` hook fires in `agent/index.ts`
2. Check trust level: autoApprove → allow, deny → block
3. Otherwise: create PermissionRequest in DB, broadcast to phone, send push notification
4. Poll DB every 500ms for approval/denial (5-minute timeout)
5. Phone user taps Approve/Deny → backend updates DB → poll picks it up → SDK continues

Internal tools (TodoWrite, KillShell, BashOutput, etc.) are auto-approved silently.

## Trust Presets

- **Observe** — Read-only, denies all edits and commands
- **Code** — Read/edit/create files, asks before every shell command (default)
- **Auto** — Full autonomy, no approvals needed

## Data Model

### Task
- id, repo, prompt, status, trustLevel, sessionId, summary, filesChanged, error, timestamps
- Statuses: queued → running → waiting_approval → completed/failed/stopped
- On server restart, stale running/queued tasks are marked stopped

### PermissionRequest
- id, taskId, tool, input, reasoning, status (pending/approved/denied), timestamps
- Cascading delete with parent task

### PushSubscription
- endpoint, keys (p256dh, auth)

## Key Files

### Backend (`backend/src/`)
- `index.ts` — Server entry, CORS, auth middleware, Express + WebSocket setup
- `api/index.ts` — REST routes (tasks CRUD, approvals, repos, templates, config, auth, push)
- `agent/index.ts` — Agent SDK wrapper, permission hooks, stream event simplification, task execution
- `ws/index.ts` — WebSocket server, auth, broadcast, client message handling
- `db/index.ts` — SQLite queries, task/permission/push CRUD
- `db/schema.ts` — Table definitions, indices, WAL mode
- `auth/index.ts` — JWT issue/verify, HMAC-derived signing key, constant-time setup code validation
- `config/index.ts` — YAML config loading, env var overrides for secrets
- `push/index.ts` — VAPID setup, web push notifications

### Frontend (`app/src/`)
- `App.tsx` — React Router, auth guard
- `screens/Login/` — Setup code input
- `screens/Home/` — Task list, connection status, pull-to-refresh
- `screens/NewTask/` — Repo picker, templates, trust level selector, prompt input
- `screens/TaskDetail/` — Streaming output, approval cards, reply input
- `screens/Approval/` — Dedicated permission request view
- `screens/Settings/` — Repos, templates, defaults, notifications, logout
- `hooks/useAuth.ts` — Login/logout, token management
- `hooks/useWebSocket.ts` — Auto-connect, reconnect, event dispatch
- `hooks/useTasks.ts` — Task list management, WebSocket event application
- `lib/api.ts` — Full REST client with token injection
- `lib/types.ts` — Domain types, trust presets, WebSocket events

### Config
- `claude-remote.config.yaml` — Repos, templates, trust defaults, auth, VAPID, server
- Env var overrides: `CLAUDE_REMOTE_AUTH_SECRET`, `CLAUDE_REMOTE_VAPID_*`

## Security Model

- **Network:** Tailscale VPN — zero internet-facing attack surface
- **Auth:** JWT with HMAC-derived signing key (setup code != signing key)
- **Secrets:** Config file gitignored, env var overrides supported
- **API:** Config endpoint filters auth/vapid/server from responses
- **Escalation:** Tool names validated against whitelist, deny list respected
- **Push:** VAPID keys never logged to console
