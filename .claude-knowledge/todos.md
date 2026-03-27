# Work Tracking

## Swarm Rules

- Each task = 30-60 min of focused agentic work
- Combine related items into full vertical slices (backend + frontend = ONE task)
- Each worker gets 2-4 tasks
- Two sets can run in parallel ONLY if their `files` arrays don't overlap
- Check the Parallelism Matrix before assigning sets to workers

---

## Work Sets

(No pending work sets — all moved to Completed or Post-MVP Backlog)

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

- [ ] Diff viewer (syntax-highlighted file diffs in task detail)
- [ ] Activity log for security monitoring (login attempts, task runs, approvals)
- [ ] Per-repo template presets with conservative trust levels
- [ ] Admin panel for connection monitoring
- [ ] Voice input via native dictation keyboard
- [ ] Concurrent task support across multiple repos
- [ ] Task queue (if repo already has running task, new ones queue)
- [ ] Swipeable approval cards for multiple pending permissions
