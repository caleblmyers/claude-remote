# Work Tracking

## Swarm Rules

- Each task = 30-60 min of focused agentic work
- Combine related items into full vertical slices (backend + frontend = ONE task)
- Each worker gets 2-4 tasks
- Two sets can run in parallel ONLY if their `files` arrays don't overlap
- Check the Parallelism Matrix before assigning sets to workers

---

## Work Sets

### S6: Fix E2E Tests
**Priority:** High — 19/37 tests failing, need to match actual UI
**Status:** Pending
**Files:**
- `app/e2e/tests/login.spec.ts`
- `app/e2e/tests/home.spec.ts`
- `app/e2e/tests/new-task.spec.ts`
- `app/e2e/tests/task-detail.spec.ts`
- `app/e2e/tests/settings.spec.ts`
- `app/e2e/tests/navigation.spec.ts`
- `app/e2e/helpers.ts`
- `app/e2e/mock-server.ts`

**Items:**
- [ ] Read each screen component to understand actual rendered text/elements, then fix selectors
- [ ] Fix login error test: app shows "Connection failed" for 401 — either fix the app bug in `api.ts` (401 handler throws "Unauthorized" which doesn't include "401" for useAuth check) or update test
- [ ] Fix state bleed: `resetState()` clears server but not browser localStorage — add `page.evaluate(() => localStorage.clear())` in helpers or beforeEach
- [ ] Fix WS timing: tests that send events via control API need `page.waitForSelector` instead of `page.waitForTimeout`
- [ ] Fix home screen tests: `fastLogin` + `seedTask` + `reload` pattern may race — ensure tasks are seeded before page loads
- [ ] Fix new-task tests: all fail because `fastLogin` navigates to `/` then test navigates to `/new`, but resetState may not have repos ready
- [ ] Run `pnpm test:e2e` and verify all 37 tests pass on both Mobile Chrome portrait + landscape

### S7: Fix Login 401 Error Message
**Priority:** Medium — minor UX bug found during e2e testing
**Status:** Pending
**Files:**
- `app/src/lib/api.ts`
- `app/src/hooks/useAuth.ts`

**Items:**
- [ ] Fix `request()` in api.ts: for `/auth/login` endpoint, don't trigger the global 401 handler (clearToken + redirect). Instead, let the error propagate with the status code so useAuth can show "Invalid setup code"
- [ ] Alternatively, change useAuth to check for "Unauthorized" in the error message instead of "401"

### S8: Session Resumption
**Priority:** High — core Phase 2 feature
**Status:** Pending
**Files:**
- `backend/src/agent/index.ts`
- `backend/src/api/index.ts`
- `app/src/screens/TaskDetail/index.tsx`
- `app/src/lib/api.ts`

**Items:**
- [ ] Backend: use Agent SDK `resume` option to continue a session by sessionId
- [ ] Backend: add `POST /tasks/:id/reply` handler that calls `replyToTask()` with session resumption
- [ ] Frontend: on completed tasks with a sessionId, show a reply input to continue the conversation
- [ ] Frontend: reply sends message, task status changes back to running, output resumes streaming

### S9: CORS Restriction
**Priority:** Medium — security improvement
**Status:** Pending
**Files:**
- `backend/src/index.ts`

**Items:**
- [ ] Replace `Access-Control-Allow-Origin: *` with configurable allowed origins
- [ ] Add `cors.allowedOrigins` field to config schema (defaults to `*` for dev)
- [ ] In production, restrict to the actual Tailscale IP or hostname

---

## Parallelism Matrix

Sets that can run in parallel (no file overlap):

| | S6 | S7 | S8 | S9 |
|---|---|---|---|---|
| S6 | - | NO | NO | YES |
| S7 | NO | - | NO | YES |
| S8 | NO | NO | - | YES |
| S9 | YES | YES | YES | - |

**Notes:**
- S6 and S7 overlap on `api.ts` and `useAuth.ts`
- S6 and S8 overlap on `TaskDetail` and `api.ts`
- S9 is fully independent (only touches `backend/src/index.ts`)

---

## Completed

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

- [ ] Session resumption (reply to completed tasks to continue)
- [ ] Diff viewer (syntax-highlighted file diffs in task detail)
- [ ] Activity log for security monitoring (login attempts, task runs, approvals)
- [ ] Per-repo template presets with conservative trust levels
- [ ] Admin panel for connection monitoring
- [ ] Voice input via native dictation keyboard
- [ ] Concurrent task support across multiple repos
- [ ] Task queue (if repo already has running task, new ones queue)
- [ ] Swipeable approval cards for multiple pending permissions
