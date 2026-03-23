# Work Tracking

## Swarm Rules

- Each task = 30-60 min of focused agentic work
- Combine related items into full vertical slices (backend + frontend = ONE task)
- Each worker gets 2-4 tasks
- Two sets can run in parallel ONLY if their `files` arrays don't overlap
- Check the Parallelism Matrix before assigning sets to workers

---

## Work Sets

### S2: Persist Stream Output
**Priority:** High — leaving task detail and returning loses all output
**Status:** Pending
**Files:**
- `backend/src/db/index.ts`
- `backend/src/db/schema.ts`
- `backend/src/agent/index.ts`
- `app/src/screens/TaskDetail/index.tsx`
- `app/src/hooks/useTasks.ts`
- `app/src/lib/api.ts`

**Items:**
- [ ] Add `task_events` table in SQLite (id, task_id, event_type, data, created_at)
- [ ] Save each stream event to DB as it's broadcast
- [ ] Add API endpoint `GET /tasks/:id/events` to fetch saved events
- [ ] On TaskDetail mount, load saved events from API (not just live WebSocket)
- [ ] Merge saved events with live WebSocket events (avoid duplicates)

### S5: Error Handling & UX Polish
**Priority:** Medium
**Status:** Pending
**Files:**
- `app/src/screens/TaskDetail/index.tsx`
- `app/src/screens/Home/index.tsx`
- `app/src/screens/NewTask/index.tsx`
- `backend/src/api/index.ts`

**Items:**
- [ ] Show error details when task creation fails (not just "load failed")
- [ ] Add pull-to-refresh on Home screen
- [ ] Add loading skeleton on TaskDetail while fetching
- [ ] Sanitize error messages returned by API (don't leak stack traces)
- [ ] Add input validation for prompt length

---

## Parallelism Matrix

Sets that can run in parallel (no file overlap):

| | S2 | S5 |
|---|---|---|
| S2 | - | NO |
| S5 | NO | - |

**Note:** S2 and S5 overlap on TaskDetail and other files — run sequentially or carefully split.

---

## Completed

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
