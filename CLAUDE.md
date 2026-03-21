# Claude Remote

Mobile controller for Claude Code. A PWA + Node.js backend that lets you start tasks, stream output, and handle permission approvals from your phone.

## Project Status

Pre-implementation. Full design spec is in `/docs/`. Read all docs before writing code.

## Architecture Summary

```
Phone (PWA)  ──WebSocket──  Backend (Node.js)  ──Agent SDK──  Claude Code
                            Runs on desktop via Tailscale
```

- **Phone app:** Vite + React + TypeScript PWA
- **Backend:** Node.js + Express + TypeScript
- **Claude integration:** `@anthropic-ai/claude-agent-sdk` with `PreToolUse` hooks for permission bridging
- **Database:** SQLite via `better-sqlite3`
- **Networking:** Tailscale mesh VPN (phone ↔ desktop)
- **Realtime:** WebSocket (ws library) for streaming task events to phone
- **Auth:** JWT token-based

## Design Docs

Read these in order:

1. `docs/overview.md` — Product vision, user goals, design decisions, constraints
2. `docs/architecture.md` — System diagram, API design, data models, config schema
3. `docs/sdk-integration.md` — Agent SDK hooks, permission bridging, streaming, session resumption
4. `docs/ux-screens.md` — Screen map with ASCII mockups for every view
5. `docs/roadmap.md` — Phased implementation plan (start with Phase 0)

## Project Structure (Target)

```
claude-remote/
├── docs/                  # Design specs (already populated)
├── backend/               # Node.js + Express + Agent SDK
│   ├── src/
│   │   ├── index.ts       # Server entry point
│   │   ├── api/           # REST route handlers
│   │   ├── ws/            # WebSocket event handling
│   │   ├── agent/         # Agent SDK wrapper + hooks
│   │   ├── db/            # SQLite schema + queries
│   │   └── config/        # Config file loading
│   ├── package.json
│   └── tsconfig.json
├── app/                   # PWA (Vite + React)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── screens/       # Home, NewTask, TaskDetail, Approval, Settings
│   │   ├── components/    # Shared UI components
│   │   ├── hooks/         # useWebSocket, useTasks, useAuth
│   │   └── lib/           # API client, types, utils
│   ├── public/
│   │   ├── manifest.json  # PWA manifest
│   │   └── sw.js          # Service worker for push notifications
│   ├── package.json
│   └── vite.config.ts
├── CLAUDE.md
└── README.md
```

## Implementation Order

Follow `docs/roadmap.md`. Start with Phase 0:

1. Set up backend with Express + TypeScript
2. Install Agent SDK and prove the core loop: receive task → run Agent SDK → stream output
3. Set up PWA scaffold with Vite + React
4. WebSocket connection between app and backend
5. Then move to Phase 1 (full MVP)

## Key Technical Details

- Agent SDK `PreToolUse` hooks are how permissions get bridged to the phone. See `docs/sdk-integration.md` for code sketches.
- The config file (`claude-remote.config.yaml`) is the source of truth for repos, templates, and trust levels. Schema is in `docs/architecture.md`.
- Trust levels are set per-task at creation time: read-only, edit-freely, full-auto, or custom per-tool.
- Stream events from the Agent SDK should be simplified before sending to the phone. See `simplifyStreamEvent()` in `docs/sdk-integration.md`.

## Conventions

- TypeScript everywhere (backend and frontend)
- Monorepo with `backend/` and `app/` directories
- Mobile-first CSS (Tailwind)
- Dark mode from day one
