# Work Tracking

## Swarm Rules

- Each task = 30-60 min of focused agentic work
- Combine related items into full vertical slices (backend + frontend = ONE task)
- Each worker gets 2-4 tasks
- Two sets can run in parallel ONLY if their `files` arrays don't overlap
- Check the Parallelism Matrix before assigning sets to workers

---

## Work Sets

### S10: Diff Viewer
**Priority:** Medium — see what Claude changed at a glance
**Status:** Pending
**Files:**
- `backend/src/agent/index.ts`
- `backend/src/api/diffs.ts` (new)
- `app/src/screens/TaskDetail/index.tsx`
- `app/src/lib/api.ts`

**Items:**
- [ ] Backend: capture `git diff` output after task completion in the repo's working directory
- [ ] Backend: store diff content with task (new `diffs` JSON field on task, or separate endpoint)
- [ ] Backend: add `GET /tasks/:id/diffs` endpoint returning per-file diffs
- [ ] Frontend: add collapsible "Changes" section in TaskDetail below summary
- [ ] Frontend: render diffs with syntax highlighting (simple monospace with +/- coloring, no external deps)

### S11: Task Queue + Concurrency
**Priority:** Medium — prevents conflicts when starting multiple tasks
**Status:** Pending
**Files:**
- `backend/src/db/index.ts`
- `backend/src/db/schema.ts`
- `backend/src/api/index.ts`
- `app/src/screens/Home/index.tsx`

**Items:**
- [ ] Backend: add `listRunningTasksByRepo(repo)` DB query
- [ ] Backend: POST /tasks checks for running tasks in same repo, queues if one exists
- [ ] Backend: add `startNextQueuedTask(repo)` called when a task completes/stops
- [ ] Backend: allow concurrent tasks across different repos
- [ ] Frontend: show queue position on queued task cards ("Queued (#2)")

### S12: Activity Log
**Priority:** Low — security monitoring and audit trail
**Status:** Pending
**Files:**
- `backend/src/db/schema.ts`
- `backend/src/db/index.ts`
- `backend/src/api/activity.ts` (new)
- `app/src/screens/Settings/index.tsx`
- `app/src/lib/api.ts`

**Items:**
- [ ] Backend: add `activity_log` table (id, user_action, task_id, detail JSON, created_at)
- [ ] Backend: add `logActivity()` and `listActivityLog()` DB functions
- [ ] Backend: add `GET /api/activity` endpoint (paginated, most recent first)
- [ ] Backend: insert log entries at: login, task create/complete/fail/stop, approve/deny, config update
- [ ] Frontend: add "Activity Log" section in Settings with scrollable list

---

## Parallelism Matrix

| | S10 | S11 | S12 |
|---|---|---|---|
| S10 | - | NO | NO |
| S11 | NO | - | NO |
| S12 | NO | NO | - |

**Notes:**
- S10 and S11 overlap on `agent/index.ts` and `api/index.ts`
- S10 and S12 overlap on `api.ts` (frontend)
- S11 and S12 overlap on `db/schema.ts`, `db/index.ts`, `api/index.ts`
- To parallelize: S10 uses `api/diffs.ts` (new file), S12 uses `api/activity.ts` (new file), keeping API overlap minimal. But `db/schema.ts` and `db/index.ts` overlap between S11 and S12.

**Best 3-worker split:**
- Worker 1: S10 (diff viewer) — uses new `api/diffs.ts`, touches `agent/index.ts` and `TaskDetail`
- Worker 2: S11 (task queue) — touches `db/*`, `api/index.ts`, `Home`
- Worker 3: S12 (activity log) — uses new `api/activity.ts` and new DB table, touches `Settings`
- Risk: Worker 2 and 3 both touch `db/schema.ts` and `db/index.ts` — reviewer merges carefully

---

## Completed

### S6+S7: Fix E2E Tests + Login 401 Bug (Wave 3, 2026-03-26)
- Fixed login 401 bug: `request()` now throws with status code so useAuth shows "Invalid setup code"
- Fixed `resetState()` to clear browser localStorage between tests
- Fixed all test selectors to match actual UI text/elements
- Fixed WS timing issues with proper waits
- Fixed state bleed and seeding order in home/navigation tests
- All 74 e2e tests passing (37 per device, Mobile Chrome portrait + landscape)

### S8: Session Resumption UX (Wave 3, 2026-03-26)
- Conditional reply input: only visible for completed/stopped/failed tasks with sessionId
- Contextual placeholder: "Continue this conversation..." / "Resume this task..." / "Retry with a message..."
- Optimistic user message display in output stream (indigo-colored, immediate)
- Optimistic status transition to "running" after reply sent
- Added `user_message` stream event type

### S9: CORS Restriction (Wave 3, 2026-03-26)
- Added `cors.allowedOrigins` config field with default `['*']` (backwards compatible)
- Dynamic CORS middleware checks request Origin against allowed list
- `Vary: Origin` header set when not using wildcard
- `CLAUDE_REMOTE_CORS_ORIGINS` env var override (comma-separated)
- Updated example config with cors section and comments

### S2: Persist Stream Output (Wave 2, 2026-03-26)
- Added `task_events` table in SQLite with FK cascade delete and index on task_id
- Stream events saved to DB in `processMessage()` before WebSocket broadcast
- Added `GET /tasks/:id/events` API endpoint for fetching saved events
- Frontend loads saved events on TaskDetail mount, merges with live WS (deduplication)
- Loading skeleton on TaskDetail while fetching task + events

### S5: Error Handling & UX Polish (Wave 2, 2026-03-26)
- Pull-to-refresh on Home screen with touch-based gesture and visual feedback
- Inline error banners with retry buttons on Home, NewTask, and TaskDetail
- API error sanitization middleware (no stack traces in production)
- Input validation: prompt length (1-10000 chars), trust level validation
- Async task execution errors now update DB status and broadcast `task:error` via WS
- Character count on prompt textarea, disabled submit when empty/over limit
- Templates loading state and "Templates unavailable" fallback
- Dismissable error bar on TaskDetail for all action failures (reply, approve, deny, stop, escalate)
- Empty state message on Home when no tasks exist

### S1: Fix Streaming Output (Wave 1, 2026-03-23)
- Fixed `simplifyStreamEvent()` to handle real SDK event format
- Added `tool_input` stream event type for richer tool display
- Fixed ApprovalCard async `acting` state bug
- Removed debug logging prefixes, replaced with clean lifecycle logging

### S3: Push Notifications (Wave 1, 2026-03-23)
- Added notification permission status UI in Settings (granted/denied/default)
- Added "Test Notification" button and `POST /push/test` endpoint
- Added VAPID key generation instructions on startup when keys missing
- Fixed notification deep-links with task-specific URLs
- Added push unsubscribe endpoint (`DELETE /push/subscribe`) and logout cleanup
- Fixed notification icon path, added task-specific tags to prevent stacking

### S4: Connection Reliability (Wave 1, 2026-03-23)
- Added server-side WebSocket heartbeat (30s ping, 10s pong timeout with per-client timer)
- Added client-side staleness detection (45s no-message threshold)
- Added "Reconnecting..." banner on Home screen
- Added visibility-change handling (no reconnects while screen off, immediate reconnect on wake)
- Added online/offline detection (pause reconnects when offline)
- Enhanced connection status indicator (green/yellow-pulse/red with labels)

---

## Process Improvements

- [ ] Include `app/src/lib/api.ts` in task file lists when adding new backend API endpoints
- [ ] Ensure main branch is clean (no uncommitted changes) before spawning swarm worktrees
- [ ] Workers should verify timing-specific acceptance criteria before marking tasks complete

---

## Post-MVP Backlog

- [ ] Per-repo template presets with conservative trust levels
- [ ] Admin panel for connection monitoring
- [ ] Voice input via native dictation keyboard
- [ ] Swipeable approval cards for multiple pending permissions
