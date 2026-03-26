# Claude Remote

A mobile controller for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Start tasks, stream output, and handle permission approvals from your phone.

```
Phone (PWA)  ──WebSocket──  Backend (Node.js)  ──Agent SDK──  Claude Code
                            Runs on your machine via Tailscale
```

Claude Remote bridges the gap between "I had an idea" and "Claude is already working on it." Fire off tasks from the couch, approve permissions from the grocery store, check if your build finished from bed.

## Features

- **Start tasks remotely** — pick a repo, type or select a template, choose a trust level, and go
- **Live streaming** — watch Claude's output in real-time via WebSocket
- **Permission bridging** — approve or deny tool use from your phone with full context
- **Push notifications** — get notified when Claude needs approval, finishes, or hits an error
- **Trust presets** — Observe (read-only), Code (read+edit), Auto (everything except Bash), or Custom per-tool
- **Task persistence** — stream output saved to SQLite, survives navigation and reconnects
- **PWA** — installable on your phone's home screen, works like a native app
- **Dark mode** — because of course

## Prerequisites

- **Node.js** 18+
- **pnpm** (`npm install -g pnpm`)
- **Anthropic API key** — set `ANTHROPIC_API_KEY` in your environment
- **Claude Code** — the Agent SDK runs Claude Code under the hood
- **Tailscale** (recommended) — for secure phone-to-desktop networking without port forwarding

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/your-username/claude-remote.git
cd claude-remote
pnpm install
```

### 2. Configure

```bash
cp claude-remote.config.example.yaml claude-remote.config.yaml
```

Edit `claude-remote.config.yaml`:

- Set `auth.secret` to a random string (`openssl rand -hex 32`)
- Add your repos with absolute paths
- Optionally generate VAPID keys for push notifications:
  ```bash
  npx web-push generate-vapid-keys
  ```

You can also use environment variables instead of the config file:
```bash
export CLAUDE_REMOTE_AUTH_SECRET="your-secret"
export CLAUDE_REMOTE_VAPID_PUBLIC_KEY="..."
export CLAUDE_REMOTE_VAPID_PRIVATE_KEY="..."
```

### 3. Run

**Development** (with hot reload):
```bash
pnpm run dev
```

This starts the backend on port 3000 and the Vite dev server on port 5173.

**Production:**
```bash
pnpm run build
pnpm run start
```

The backend serves the built PWA from `app/dist/` in production.

### 4. Connect from your phone

**With Tailscale (recommended):**
1. Install Tailscale on both your desktop and phone
2. Sign in to the same Tailscale account
3. Find your desktop's Tailscale IP (`tailscale ip`)
4. Open `http://<tailscale-ip>:3000` on your phone

**On the same LAN:**
1. Find your desktop's local IP
2. Open `http://<local-ip>:3000` on your phone

### 5. Log in

On first visit, you'll be prompted for the auth secret you set in the config. This generates a JWT token stored in your browser (expires in 7 days).

### 6. Install the PWA

In your phone's browser, tap "Add to Home Screen" to install Claude Remote as a standalone app.

## Architecture

```
claude-remote/
├── backend/           # Node.js + Express + Agent SDK
│   └── src/
│       ├── index.ts   # Server entry point
│       ├── api/       # REST route handlers
│       ├── ws/        # WebSocket event streaming
│       ├── agent/     # Agent SDK wrapper + permission hooks
│       ├── db/        # SQLite schema + queries
│       ├── auth/      # JWT authentication
│       ├── push/      # Web Push notifications
│       └── config/    # YAML config loading
├── app/               # PWA (Vite + React + TypeScript)
│   └── src/
│       ├── screens/   # Home, NewTask, TaskDetail, Approval, Settings
│       ├── hooks/     # useWebSocket, useTasks, useAuth
│       └── lib/       # API client, types, utilities
├── docs/              # Design specs and architecture docs
└── claude-remote.config.example.yaml
```

### How it works

1. You create a task from the phone (repo + prompt + trust level)
2. The backend spawns a Claude Code session via the Agent SDK
3. Stream events flow back to your phone over WebSocket in real-time
4. When Claude wants to use a tool, the `PreToolUse` hook checks the trust level:
   - **Auto-approved tools** proceed immediately
   - **Always-ask tools** send a permission request to your phone
   - **Denied tools** are blocked automatically
5. You approve or deny from a notification or the in-app approval card
6. Events are persisted to SQLite so you can navigate away and come back

## Configuration

The config file (`claude-remote.config.yaml`) controls everything:

| Section | Purpose |
|---------|---------|
| `server` | Port and host binding |
| `auth` | Shared secret for JWT generation |
| `vapid` | Keys for push notifications |
| `repos` | List of repos Claude can work in, with optional per-repo templates |
| `globalTemplates` | Task templates available across all repos |
| `defaults` | Default trust level and notification preferences |

See `claude-remote.config.example.yaml` for the full schema with comments.

### Trust Presets

| Preset | Auto-approve | Ask | Deny |
|--------|-------------|-----|------|
| **Observe** | Read, Grep, Glob | — | Edit, Write, Bash |
| **Code** | Read, Grep, Glob, Edit, Write | Bash | — |
| **Auto** | Read, Grep, Glob, Edit, Write, Bash | — | — |
| **Custom** | You choose per-tool | You choose | You choose |

## Security Notes

- **Tailscale** provides encrypted peer-to-peer networking — no ports exposed to the internet
- **JWT auth** with HMAC-SHA256 derived signing key (your setup code is not the signing key)
- **No secrets in code** — all credentials live in the gitignored config file or environment variables
- **API error sanitization** — stack traces never leak to clients in production
- **Input validation** — prompt length limits, trust level validation
- **Constant-time comparison** for auth secret to prevent timing attacks
- Configure [Tailscale ACLs](https://tailscale.com/kb/1018/acls/) to restrict phone access to only port 3000

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Backend:** Node.js, Express, TypeScript
- **Claude:** `@anthropic-ai/claude-code` Agent SDK
- **Database:** SQLite via `better-sqlite3`
- **Realtime:** WebSocket (`ws`)
- **Push:** Web Push API via `web-push`
- **Auth:** JWT via `jsonwebtoken`
- **Networking:** Tailscale (recommended)

## License

[MIT](LICENSE)
