# Claude Remote — Implementation Roadmap

## Phase 0: Foundation (Week 1)

Set up the project skeleton and prove the core loop works end-to-end.

- [ ] Create repo: `claude-remote`
- [ ] Initialize Node.js backend with TypeScript
- [ ] Install Agent SDK, express, ws, better-sqlite3
- [ ] Prove the core loop locally:
  - Backend receives a task via REST
  - Spawns Agent SDK session
  - Streams output to a WebSocket client
  - Permission hook pauses and resumes on approval
- [ ] Install Tailscale on desktop and phone
- [ ] Verify phone can reach backend via Tailscale IP
- [ ] Scaffold PWA with Vite + React + TypeScript

**Exit criteria:** Phone can reach a hello-world endpoint on the backend via Tailscale. Backend can run a Claude Code task and stream output to a test client.

---

## Phase 1: MVP (Weeks 2-3)

The minimum viable phone controller. Start tasks, see output, handle approvals.

### Backend
- [ ] Task CRUD API (create, list, get, stop)
- [ ] WebSocket server with task event streaming
- [ ] Agent SDK integration with PreToolUse hooks
- [ ] Permission request storage and approval/deny endpoints
- [ ] Config file loading (repos, templates, trust defaults)
- [ ] SQLite schema for tasks and permission requests
- [ ] Basic JWT auth (shared secret setup flow)

### Phone (PWA)
- [ ] Home screen: active tasks + last completed
- [ ] New Task flow: repo picker → template/text input → trust level → send
- [ ] Task Detail: split view with summary + output stream
- [ ] Approval handling: inline approval card when tapping into a waiting task
- [ ] WebSocket connection with auto-reconnect
- [ ] Basic settings: view repos and connection status
- [ ] Add to home screen (PWA manifest + icons)
- [ ] Dark mode

### Not in MVP
- Push notifications (use in-app polling for now)
- Voice input
- Session resumption
- Smart suggestions from history
- Settings editing from the app (edit config file directly)

**Exit criteria:** You can open the app on your phone, pick a repo, start a task, watch it stream, approve a permission, and see the result.

---

## Phase 2: Polish & Notifications (Weeks 4-5)

Make it reliable and non-intrusive enough for daily use.

- [ ] Web Push notifications (service worker + web-push)
  - Permission requests → push with context card
  - Task completion → push with summary
  - Task errors → push with error message
- [ ] Notification tapping deep-links to the right screen
- [ ] Session resumption: "Reply" to completed tasks to continue the session
- [ ] Trust level "Custom" option with per-tool toggles
- [ ] Auto-approve escalation ("auto-approve Bash for this session")
- [ ] Error display: structured error view with retry option
- [ ] Settings screen: edit repos, templates, trust defaults from the app
- [ ] Config sync: app settings write back to the YAML config file
- [ ] Task cancellation (graceful stop with cleanup)
- [ ] Connection status indicator in header
- [ ] Loading states and skeleton screens

**Exit criteria:** You can leave the app, get a push notification when Claude needs approval, tap it, approve, and go back to what you were doing.

---

## Phase 3: Multi-Task & Power Features (Weeks 6-8)

Scale from single-task to multi-task, add power-user features.

- [ ] Concurrent task support: run tasks across multiple repos simultaneously
- [ ] Task queue: if a repo already has a running task, new tasks queue
- [ ] Smart suggestions: surface recent task variations based on repo
- [ ] Voice input: native dictation keyboard integration
- [ ] Diff viewer: syntax-highlighted file diffs within task detail
- [ ] Per-repo templates editable from the app
- [ ] Task retry: re-run a failed task with the same or modified prompt
- [ ] Swipeable approval cards when multiple are pending
- [ ] Background task management (tasks continue when app is closed)
- [ ] Server health monitoring in settings

**Exit criteria:** You can have 2-3 tasks running across repos, manage all of them from the phone, and use the system daily without frustration.

---

## Phase 4: Future Vision

Longer-term improvements that turn Claude Remote into a broader AI command center.

### Multi-Agent Orchestration
- Planner/worker/reviewer agent model
- Agent selection per task (pick which agent persona to use)
- Agent chains: task A output feeds into task B

### Broader AI OS Integration
- Brain repo integration: trigger brain workflows from phone ("log today", "news", "status")
- Cross-repo awareness: "What changed across all my projects today?"
- Morning briefing: auto-generated summary of overnight activity

### Collaboration
- Multi-user support with per-user sessions
- Shared task visibility
- Role-based permissions (admin vs viewer)

### Infrastructure Evolution
- Move backend to dedicated server
- Docker containerization
- Optional cloud relay for push when desktop is off
- Monitoring dashboard (Grafana or similar)

### Advanced UX
- Custom voice commands
- Widget for phone home screen (task status at a glance)
- Keyboard shortcuts for PWA on tablet
- Haptic feedback on approval actions

---

## Tech Debt & Maintenance

Recurring work to keep the system healthy:

- Keep Agent SDK dependency up to date
- Monitor for SDK API changes that affect hooks or streaming
- Regularly test permission bridging end-to-end
- Review and prune templates that aren't used
- Back up SQLite database periodically
