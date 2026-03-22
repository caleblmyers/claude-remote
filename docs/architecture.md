# Claude Remote — Technical Architecture

## System Overview

```
┌─────────────┐       ┌──────────────────┐       ┌─────────────────┐
│  Phone App  │◄─────►│  Backend Server   │◄─────►│   Claude Code   │
│  (PWA)      │  WS   │  (Node.js)       │  SDK  │   (Agent SDK)   │
└─────────────┘       └──────────────────┘       └─────────────────┘
       │                      │
       │                      │
  Tailscale              SQLite/Redis
  mesh VPN              (sessions, config)
```

---

## Networking: Tailscale

**Why Tailscale:**
- Private mesh VPN — no public URLs, no exposed ports
- Works on cellular and WiFi
- Free tier supports personal use
- Phone and desktop always reachable to each other
- When you move to a dedicated server, just add it to the Tailscale network — nothing else changes

**How it works:**
Tailscale is a mesh VPN built on WireGuard. It's not a server you run — it creates a private encrypted network between your devices. Both devices sign in to the same Tailscale account, each gets a stable private IP (e.g., `100.x.x.x`), and they can talk directly to each other over an encrypted peer-to-peer tunnel. Traffic never passes through Tailscale's servers (unless direct connection fails, in which case encrypted DERP relays are used — still end-to-end encrypted).

**Setup:**
1. Install Tailscale on desktop and phone
2. Sign in to the same Tailscale account on both
3. Backend server binds to Tailscale IP (e.g., `100.x.x.x:3000`)
4. Phone app connects to that IP
5. No DNS, no tunnels, no cloud relay

**Port exposure:**
Tailscale exposes ALL ports on a device by default — it's not port forwarding, it's full network access as if both devices are on the same LAN. This means your phone can reach any port on your desktop, not just 3000.

**Security hardening:**
1. **Tailscale ACLs** — configure access rules in the Tailscale admin console to restrict your phone to only port 3000 on your desktop. Example ACL:
   ```json
   {
     "acls": [
       {
         "action": "accept",
         "src": ["tag:phone"],
         "dst": ["tag:desktop:3000"]
       }
     ]
   }
   ```
2. **Bind to Tailscale IP only** — set `host` in config to your Tailscale IP instead of `0.0.0.0`. This prevents access from your local network (only Tailscale traffic reaches the backend).
3. **JWT auth** — even on the private network, all API requests require a valid token. This is a second layer on top of Tailscale's network-level encryption.
4. **Device approval** — Tailscale requires explicit approval for new devices joining your network. Don't share your tailnet with untrusted devices.

**Trust model:**
- WireGuard is audited and minimal — considered best-in-class for VPN encryption
- Tailscale's coordination server sees device metadata (which devices, when online) but never your traffic content
- If metadata visibility is a concern, self-host the coordination server with [Headscale](https://github.com/juanfont/headscale)
- No ports are exposed to the public internet — zero internet-facing attack surface

**Future scaling:** If you add a cloud server, it joins the same Tailscale network. The phone connects to whichever machine is running the backend.

---

## Tech Stack

### Phone App: Progressive Web App (PWA)

**Why PWA over React Native:**
- Faster to build — it's just a web app
- No app store review/deployment cycle
- Add to home screen for app-like experience
- Push notifications via Web Push API
- You already know React — use Next.js or Vite + React
- Cross-platform (iOS + Android) for free
- Easy to iterate during early development

**Framework:** Vite + React + TypeScript
**Styling:** Tailwind CSS (mobile-first)
**State:** Zustand or React context (lightweight)
**Realtime:** WebSocket client (native browser API)
**Push notifications:** Web Push API + service worker

**Upgrade path:** If PWA limitations become a problem (background processing, deeper OS integration), migrate to React Native later. The backend API stays the same.

### Backend Server: Node.js + Express

Runs on your desktop (WSL) alongside Claude Code.

**Core responsibilities:**
1. Serve the PWA static files
2. WebSocket server for real-time streaming
3. REST API for task CRUD, config, approvals
4. Spawn and manage Agent SDK sessions
5. Bridge permission prompts to phone via WebSocket
6. Store session state and task history

**Key dependencies:**
- `@anthropic-ai/claude-agent-sdk` — Claude Code integration
- `express` — HTTP API
- `ws` — WebSocket server
- `better-sqlite3` — session/task storage (no separate DB server)
- `web-push` — push notifications

**Why SQLite over Postgres/Redis:**
- No external services to run
- Plenty fast for single-user
- Task history, session state, and config all fit in one file
- Zero ops overhead

### Claude Code Integration: Agent SDK

The Agent SDK is the core integration layer. See `sdk-integration.md` for detailed implementation.

---

## API Design

### REST Endpoints

```
POST   /api/tasks              Create and start a new task
GET    /api/tasks              List active + recent tasks
GET    /api/tasks/:id          Get task detail (summary, status, output)
POST   /api/tasks/:id/stop     Stop a running task
POST   /api/tasks/:id/resume   Resume a paused/completed session
DELETE /api/tasks/:id          Remove from history

POST   /api/tasks/:id/approve  Approve a pending permission
POST   /api/tasks/:id/deny     Deny a pending permission
POST   /api/tasks/:id/reply    Send a message to a running session

GET    /api/repos              List configured repos
GET    /api/templates          List task templates (global + per-repo)

GET    /api/config             Read server config
PUT    /api/config             Update server config

POST   /api/auth/login         Authenticate (token-based)
```

### WebSocket Events

**Server → Phone:**
```
task:created        { taskId, repo, prompt, status }
task:progress       { taskId, step, summary, detail }
task:stream         { taskId, type: "text"|"tool_call"|"tool_result", content }
task:permission     { taskId, requestId, tool, input, reasoning }
task:complete       { taskId, summary, filesChanged, testResults }
task:error          { taskId, error, context }
task:status_change  { taskId, oldStatus, newStatus }
```

**Phone → Server:**
```
task:approve        { taskId, requestId }
task:deny           { taskId, requestId, reason? }
task:reply          { taskId, message }
task:stop           { taskId }
```

---

## Data Model

### Task

```typescript
interface Task {
  id: string
  repo: string                    // repo path or name
  prompt: string                  // original user prompt
  status: 'queued' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'stopped'
  trustLevel: TrustLevel          // permission config for this task
  sessionId?: string              // Agent SDK session ID for resumption
  createdAt: string
  updatedAt: string
  summary?: string                // AI-generated summary of what happened
  filesChanged?: string[]         // list of modified files
  error?: string                  // error message if failed
}

interface TrustLevel {
  autoApprove: string[]           // tool names: ["Read", "Glob", "Grep", "Edit"]
  alwaysAsk: string[]             // tool names: ["Bash", "Write"]
  deny: string[]                  // tool names to block entirely
}
```

### Permission Request

```typescript
interface PermissionRequest {
  id: string
  taskId: string
  tool: string                    // "Bash", "Edit", "Write", etc.
  input: Record<string, unknown>  // tool parameters
  reasoning?: string              // Claude's reasoning for this action
  status: 'pending' | 'approved' | 'denied'
  createdAt: string
  resolvedAt?: string
}
```

### Config

```yaml
# claude-remote.config.yaml

server:
  port: 3000
  host: "100.x.x.x"  # bind to Tailscale IP only (find via `tailscale ip -4`)

auth:
  secret: "..."     # JWT secret for token auth

repos:
  - name: task-toad
    path: /home/caleb/task-toad
    templates:
      - name: Run tests
        prompt: "Run the test suite and report results"
        trustLevel: { autoApprove: [Read, Bash] }
      - name: Fix lint
        prompt: "Fix all lint errors"
        trustLevel: { autoApprove: [Read, Edit, Bash] }

  - name: brain
    path: /home/caleb/brain
    templates:
      - name: Daily log
        prompt: "log today"
      - name: Status check
        prompt: "status"

  - name: middlelands-io
    path: /home/caleb/middlelands-io

  - name: movie-night-picker
    path: /home/caleb/movie-night-picker

globalTemplates:
  - name: Run tests
    prompt: "Run the test suite and fix any failures"
    trustLevel: { autoApprove: [Read, Grep, Glob, Bash] }
  - name: Fix bugs
    prompt: ""  # user fills in description
    trustLevel: { autoApprove: [Read, Grep, Glob, Edit] }
  - name: Code review
    prompt: "Review recent changes for bugs, security issues, and style"
    trustLevel: { autoApprove: [Read, Grep, Glob] }

defaults:
  trustLevel:
    autoApprove: [Read, Grep, Glob]
    alwaysAsk: [Bash, Write, Edit]
    deny: []
  notifications:
    onComplete: true
    onError: true
    onPermission: true
```

---

## Authentication

**MVP:** Token-based auth with a shared secret.

1. First launch: phone connects to backend, enters a setup code displayed on the server
2. Server issues a JWT
3. Phone stores JWT, includes in all requests
4. JWT has a long expiry (30 days), refresh on use

**Future:** If multi-user is needed, add user accounts with individual tokens and per-user session isolation.

**Security considerations:**
- Tailscale already provides network-level encryption and auth
- JWT adds application-level auth as a second layer
- No public URLs means no internet-facing attack surface
- Token revocation via server restart or config change

---

## Deployment

### MVP (Desktop/WSL)

```
Desktop (WSL)
├── Tailscale (network)
├── Node.js backend server (port 3000)
│   ├── Serves PWA static files
│   ├── REST API
│   ├── WebSocket server
│   └── Agent SDK sessions
├── SQLite database (sessions, tasks, config)
└── Claude Code (invoked via Agent SDK)
```

**Startup:** Single `npm start` or a systemd service that starts the backend.

### Future (Dedicated Server)

Same stack, just running on a different machine in the Tailscale network. Add:
- Process manager (PM2 or systemd) for reliability
- Auto-restart on crash
- Log rotation
- Optional: Docker container for isolation
