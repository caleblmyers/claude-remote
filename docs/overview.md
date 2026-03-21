# Claude Remote

_Working title — final branding TBD_

A mobile interface for controlling Claude Code running on your desktop or server. Not a chat app, not a dashboard — a full-power remote control optimized for phone UX.

## Product Vision

Claude Remote gives you the same capabilities you have sitting at your terminal, accessible from your phone. Fire off tasks while on the couch, approve permissions from the grocery store, check if your build finished from bed. It's the missing bridge between "I had an idea" and "Claude is already working on it."

## Status

- **Phase:** Design complete, pre-implementation
- **Home:** Design docs in `/brain`, code will live in its own repo
- **Design date:** 2026-03-21

---

## User Goals

1. **Start work remotely** — kick off Claude Code tasks from the phone so work is in progress before sitting down
2. **Monitor running tasks** — glanceable status of what Claude is doing, with drill-down to live output
3. **Handle approvals** — respond to permission prompts via push notification without returning to desk
4. **Review outputs** — see summaries of what Claude produced (files changed, tests run, diffs)
5. **Manage sessions** — attach to running sessions or start new ones, across multiple repos

## Top Use Cases

| Scenario | What happens |
|----------|-------------|
| Idea while away | Open app → pick repo → type or dictate task → Claude starts working |
| Long-running task | Glance at home screen → see progress bar and current step → go back to life |
| Permission needed | Push notification → context card shows what + why → approve or deny |
| Task complete | Push notification → summary card → review changes → optionally continue session |
| Morning kickoff | Open app → start tasks across 2-3 repos → sit down to finished work |

---

## Design Decisions

### UX Model

**Hybrid: dashboard home + chat/command mode for complex tasks**

- Home screen shows active tasks front and center
- New task flow: repo picker → templates + free text input
- Task detail: split view — summary top, raw output bottom (draggable divider)
- Approval UX: context card with tool name, action, reasoning, approve/deny buttons
- Information density: adaptive — minimal by default, expandable everywhere

### Trust & Permissions

- Trust level set at task creation: pick which tool categories are auto-approved
- Per-tool-type granularity (e.g., auto-approve reads/edits, always ask for shell/git)
- Mirrors Claude Code's existing permission model — same prompts on phone
- No artificial restrictions beyond what you'd set at the terminal

### Templates

- Global base templates: test, fix, review, commit, lint — apply to all repos
- Per-repo overrides and additions
- Nice-to-have: smart suggestions from recent task history

### Notifications

- Push notification for: permission requests, task completion, task errors
- Configurable per task at creation time
- Error notifications include summary of what went wrong

### Session Model

- Start new sessions from phone
- Attach to already-running sessions
- Session IDs persist for resumption across app opens
- History: active tasks + last completed (not a full archive)

### Configuration

- Config file on server is source of truth (YAML/JSON)
- App has settings screen that reads/writes the config
- Config defines: repos, templates, default trust levels, notification preferences

---

## Constraints & Boundaries

- **Phone is always connected** — no offline mode needed
- **Single user MVP** — but auth designed for eventual multi-user
- **No raw git commands from phone** — git operations happen through Claude's workflow
- **Voice input is post-MVP** — focus on text + templates first
- **Desktop (WSL) today, server later** — networking must work for both
- **Brain repo is for design only** — code lives in its own repo
