# Architectural Decisions

Key decisions and their rationale for future reference.

---

### Agent SDK over CLI spawning
**Decision:** Use `@anthropic-ai/claude-code` SDK's `query()` function instead of spawning `claude` CLI processes.
**Why:** SDK provides typed hooks (`PreToolUse`), streaming messages, session resumption, and abort control. CLI spawning would require parsing stdout and wouldn't support permission bridging.

### SQLite over Postgres
**Decision:** Use `better-sqlite3` for all persistence.
**Why:** Single-user app running on a desktop. No need for a database server. SQLite is zero-config, fast, and the DB file lives next to the backend. WAL mode enables concurrent reads during writes.

### Tailscale over port forwarding / cloud relay
**Decision:** Use Tailscale mesh VPN for phone-to-desktop connectivity.
**Why:** Zero internet-facing attack surface. WireGuard encryption. Stable IPs. No DNS or tunnel configuration. If we later add a cloud server, it just joins the same tailnet.

### HMAC-derived JWT signing key (2026-03-22)
**Decision:** Derive JWT signing key from setup code via HMAC instead of using setup code directly.
**Why:** If setup code leaks (written down, texted, seen in config), existing tokens aren't directly compromised. The signing key is `HMAC-SHA256(setupCode, "claude-remote-jwt")`.

### Constant-time setup code comparison (2026-03-22)
**Decision:** Use `crypto.timingSafeEqual` for setup code validation.
**Why:** Prevents timing attacks that could leak the setup code character by character.

### Trust presets: Observe / Code / Auto (2026-03-23)
**Decision:** Simplified from read-only/edit-freely/full-auto to three clear escalation levels.
**Why:** "Edit freely" was confusing — users didn't know what "asks for shell" meant. New names are action-oriented. "Observe" denies edits/commands (not just asks). "Code" groups Edit+Write together (splitting them made no practical sense). "Auto" is clearer than "Full auto".

### Config file gitignored (2026-03-22)
**Decision:** `claude-remote.config.yaml` added to `.gitignore`.
**Why:** Contains auth secret and VAPID private key. Secrets should never be version controlled.

### Vite dev port 5174 (2026-03-23)
**Decision:** Default Vite dev server port is 5174, not 5173.
**Why:** User runs task-toad on 5173. Avoid port conflicts between simultaneous projects.

### Internal tools auto-approved (2026-03-23)
**Decision:** TodoWrite, KillShell, BashOutput, and other internal Claude Code tools are silently auto-approved in the permission hook.
**Why:** These are internal housekeeping tools, not user-facing actions. Asking for approval on "TodoWrite" is confusing and adds friction with no security benefit.

### Stale task cleanup on startup (2026-03-23)
**Decision:** On server startup, any tasks stuck in running/waiting_approval/queued are marked as stopped.
**Why:** When the server restarts, all Claude Code processes die with it. The DB records become stale. Without cleanup, the phone shows phantom "running" tasks.

### pnpm workspace (2026-03-22)
**Decision:** Monorepo with pnpm workspaces (`backend/` and `app/`).
**Why:** User's other projects use pnpm. Workspace allows shared root scripts and single install command. `onlyBuiltDependencies` config handles better-sqlite3 native build.
