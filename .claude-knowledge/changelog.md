# Development Changelog

Summaries of work completed each session. Most recent first.

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
