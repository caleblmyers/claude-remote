# Development Changelog

Summaries of work completed each session. Most recent first.

---

## 2026-03-26 — Wave 2 swarm: event persistence, error handling, UX polish

### S2: Persist Stream Output
- Added `task_events` SQLite table (id, task_id, event_type, data, created_at) with cascade delete
- Stream events persisted in `processMessage()` before WebSocket broadcast
- New `GET /tasks/:id/events` endpoint returns saved events ordered by id
- Frontend `useTaskOutput()` loads saved events on mount, deduplicates with live WS
- TaskDetail shows loading skeleton while fetching task data and events

### S5: Error Handling & UX Polish
- Touch-based pull-to-refresh on Home screen with visual feedback indicator
- Inline error banners with retry buttons on Home, NewTask, and TaskDetail screens
- Express error-handling middleware sanitizes errors (no stack traces in production)
- POST /tasks validates prompt length (1-10000 chars) and trust level against known presets
- Async `executeTask()`/`replyToTask()` errors now update task status to 'error' and broadcast via WS
- Character count below prompt textarea, submit disabled when empty or over limit
- Templates section shows loading state; "Templates unavailable" fallback on fetch failure
- Dismissable `actionError` bar on TaskDetail for all action failures
- Empty state message on Home screen when no tasks exist
- Error state cleared on new input in NewTask

---

## 2026-03-23 — Wave 1 swarm: streaming, push notifications, connection reliability

### S1: Fix Streaming Output
- Rewrote `simplifyStreamEvent()` to handle actual Agent SDK event format
- Added `tool_input` stream event type for displaying tool arguments
- Fixed ApprovalCard `acting` state never resetting after async approval
- Replaced debug logging with clean task lifecycle logs

### S3: Push Notifications
- Added notification permission status display in Settings screen
- Added "Test Notification" button with `POST /push/test` backend endpoint
- VAPID key generation instructions logged on startup when keys missing
- Fixed notification payloads to include deep-link URLs (`/tasks/{taskId}`)
- Added `DELETE /push/subscribe` endpoint for unsubscribe on logout
- Fixed notification icon path, added task-specific tags

### S4: Connection Reliability
- Server-side WebSocket heartbeat: 30s ping interval, 10s pong timeout per client
- Client-side staleness detection: reconnects after 45s with no messages
- "Reconnecting..." amber banner on Home screen when disconnected
- Visibility-change aware: pauses reconnects when screen off, immediate reconnect on wake
- Online/offline detection: pauses reconnects when device has no network
- Enhanced connection status indicator with animated states

---

## 2026-03-23 — Trust preset redesign, internal tools, stale task cleanup

- Redesigned trust presets: read-only/edit-freely/full-auto → Observe/Code/Auto
- Observe now denies (not just asks) Edit/Write/Bash
- Code groups Edit+Write together, only asks for Bash
- Auto-approve internal Claude Code tools (TodoWrite, KillShell, BashOutput, etc.)
- Added tool name validation and deny list enforcement on escalation endpoint
- Clean up stale running/queued tasks on server startup
- Fixed double output in task stream (removed duplicate assistant message broadcasting)
- Added user prompt display at top of task output
- Added debug logging for SDK messages and hook invocations

## 2026-03-22 — Security hardening, pnpm migration, core bug fixes

### Security
- HMAC-derived JWT signing key (setup code != signing key)
- Reduced JWT expiry from 30d to 7d
- Constant-time setup code comparison
- Config file added to .gitignore
- VAPID private key filtered from config API response
- Blocked vapid/server changes from phone API
- Environment variable overrides for all secrets
- Stopped logging VAPID private keys to console

### Infrastructure
- Migrated from npm to pnpm workspace
- Added root package.json with dev/build/start scripts
- Fixed pnpm strict module resolution (explicit type annotations)
- Added better-sqlite3 to onlyBuiltDependencies

### Bug Fixes
- Fixed login not redirecting (separate useAuth state instances)
- Fixed WebSocket connecting to wrong port (5174 not remapped to 3000)
- Fixed Vite crash on phone disconnect (ECONNRESET handler plugin)
- Added `host: true` to Vite config for Tailscale access

### Initial Implementation (from scaffold)
- Full backend: Express + Agent SDK + WebSocket + SQLite + JWT auth + push notifications
- Full frontend: Login, Home, NewTask, TaskDetail, Approval, Settings screens
- Permission bridging via PreToolUse hooks
- Tailscale documentation with security hardening guidance
