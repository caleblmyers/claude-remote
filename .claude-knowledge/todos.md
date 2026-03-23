# Work Tracking

## Swarm Rules

- Each task = 30-60 min of focused agentic work
- Combine related items into full vertical slices (backend + frontend = ONE task)
- Each worker gets 2-4 tasks
- Two sets can run in parallel ONLY if their `files` arrays don't overlap
- Check the Parallelism Matrix before assigning sets to workers

---

## Work Sets

### S1: Fix Streaming Output
**Priority:** Critical — app is not useful without this
**Status:** Pending
**Files:**
- `backend/src/agent/index.ts`
- `app/src/screens/TaskDetail/index.tsx`
- `app/src/hooks/useTasks.ts`
- `app/src/lib/types.ts`

**Items:**
- [ ] Debug SDK message types — check `[sdk]` log output to understand what message types the Agent SDK actually sends
- [ ] Fix `simplifyStreamEvent()` to handle actual SDK event format (may not be `content_block_delta`/`content_block_start`)
- [ ] Verify streaming works end-to-end: task created → output streams to phone → completion shown
- [ ] Remove debug logging (`[sdk]`, `[hook]`) after streaming is confirmed working

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

### S3: Push Notifications
**Priority:** Medium — needed for "approve from lock screen" workflow
**Status:** Pending
**Files:**
- `app/src/hooks/usePushNotifications.ts`
- `app/public/sw.js`
- `app/src/screens/Settings/index.tsx`
- `backend/src/push/index.ts`

**Items:**
- [ ] Test push notification registration from phone
- [ ] Test permission request notification delivery
- [ ] Test notification tap deep-link to task detail
- [ ] Test task completion notification
- [ ] Handle notification permission denied gracefully

### S4: Connection Reliability
**Priority:** Medium — Vite crashes, WebSocket drops
**Status:** Pending
**Files:**
- `app/vite.config.ts`
- `app/src/hooks/useWebSocket.ts`
- `app/src/screens/Home/index.tsx`
- `backend/src/ws/index.ts`

**Items:**
- [ ] Verify Vite `handleConnectionReset` plugin prevents crashes on phone disconnect
- [ ] Add connection status indicator to Home screen header (green/yellow/red dot)
- [ ] Show "Reconnecting..." banner when WebSocket is disconnected
- [ ] Test WebSocket reconnect after phone sleep/wake cycle
- [ ] Add heartbeat/ping to detect stale connections

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

| | S1 | S2 | S3 | S4 | S5 |
|---|---|---|---|---|---|
| S1 | - | NO | YES | YES | NO |
| S2 | NO | - | YES | YES | NO |
| S3 | YES | YES | - | YES | NO |
| S4 | YES | YES | YES | - | NO |
| S5 | NO | NO | NO | NO | - |

**Conflict-free combinations:**
- S1 + S3 + S4 (streaming + push + connection — good first wave)
- S2 + S3 + S4 (persistence + push + connection — after S1 is done)

---

## Completed

_(Nothing completed yet — project is in initial development)_

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
