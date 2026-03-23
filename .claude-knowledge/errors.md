# Error Log

Running log of errors encountered and their resolutions.

---

## Template

```
### [Date] — Short description
**Context:** What was being done
**Error:** The error message or symptom
**Cause:** Root cause
**Fix:** What resolved it
**Rule:** Prevention guideline for agents
```

---

### 2026-03-22 — ECONNRESET crashes Vite dev server
**Context:** Phone browser disconnects (sleep, tab close, network change)
**Error:** `Error: read ECONNRESET` — unhandled error event on Socket, crashes Vite process
**Cause:** Vite's dev server doesn't handle abrupt client disconnects gracefully
**Fix:** Added `handleConnectionReset` Vite plugin that catches `ECONNRESET` on `clientError` and destroys the socket silently
**Rule:** Always handle connection resets in dev servers that accept mobile connections

---

### 2026-03-22 — Port 5173 conflict with task-toad
**Context:** Starting Vite dev server on default port
**Error:** Port 5173 already in use
**Cause:** task-toad project runs on 5173
**Fix:** Changed Vite config to port 5174, updated WebSocket hook to remap 5174→3000
**Rule:** This project uses port 5174 for frontend, 3000 for backend

---

### 2026-03-22 — ERR_SSL_PROTOCOL_ERROR on phone
**Context:** Trying to access the app from phone browser
**Error:** ERR_SSL_PROTOCOL_ERROR — browser shows invalid response
**Cause:** Phone browser auto-upgraded `http://` to `https://`. Vite is HTTP only.
**Fix:** Explicitly type `http://` in the URL bar, or use incognito tab
**Rule:** No SSL is needed — Tailscale provides encryption at the network layer

---

### 2026-03-22 — Login doesn't redirect after success
**Context:** Entering setup code on phone
**Error:** Button doesn't show loading state, page doesn't change after login
**Cause:** `LoginScreen` and `AuthGuard` each called `useAuth()` independently — separate state instances. Setting `isAuthenticated` in one didn't affect the other.
**Fix:** Removed `useAuth` from LoginScreen, call `api.auth.login()` directly and `navigate("/")` on success
**Rule:** Don't rely on hook state for cross-component communication without a context provider

---

### 2026-03-22 — WebSocket connects to wrong port from phone
**Context:** Phone connected but no streaming output received
**Error:** WebSocket silently connecting to port 5174 instead of 3000
**Cause:** `useWebSocket.ts` only remapped port 5173→3000, but app runs on 5174
**Fix:** Updated to remap both 5173 and 5174 to 3000
**Rule:** Keep WebSocket port remapping in sync with Vite config port

---

### 2026-03-23 — Double output in task detail
**Context:** Viewing task output on phone
**Error:** Every text block appeared twice
**Cause:** `processMessage()` in `agent/index.ts` broadcast both `stream_event` (incremental deltas) AND `assistant` messages (complete content). SDK sends both.
**Fix:** Removed the `assistant` message handler — only stream events are forwarded now
**Rule:** The SDK sends both streaming deltas and full messages. Only use one.

---

### 2026-03-23 — Approval shows "TodoWrite" and "BashOutput" instead of real commands
**Context:** Phone shows approval request for internal tools
**Error:** User asked to approve "TodoWrite" — confusing, not a real user action
**Cause:** Internal Claude Code tools (TodoWrite, KillShell, BashOutput, etc.) aren't in any trust level list, so they fall through to the "needs approval" path
**Fix:** Added internal tools whitelist that auto-approves them silently
**Rule:** Maintain the internal tools list in `agent/index.ts` as new internal tools are discovered

---

### 2026-03-23 — Stale "running" task after server restart
**Context:** Restarted backend, phone still shows task as "running"
**Error:** Task stuck in running state with no actual Claude Code process
**Cause:** Server killed Claude Code process but SQLite record still says "running"
**Fix:** On DB init, update all running/waiting_approval/queued tasks to "stopped"
**Rule:** Always clean up stale task states on server startup

---

### 2026-03-22 — pnpm strict module resolution breaks TypeScript build
**Context:** Migrating from npm to pnpm
**Error:** `TS2742: The inferred type of 'router' cannot be named without a reference to '@types/express-serve-static-core'`
**Cause:** pnpm's strict hoisting doesn't make transitive @types packages available
**Fix:** Added explicit type annotations: `const router: Router` and `const app: express.Express`
**Rule:** With pnpm, add explicit type annotations when TypeScript can't resolve transitive types
