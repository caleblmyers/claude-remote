# Cost Tracking

## AI Usage

### Claude Code (Agent SDK)
- Each task spawns a Claude Code session via the Agent SDK
- Cost depends on task complexity, model used, and number of tool calls
- No per-session cost tracking yet — Agent SDK reports `total_cost_usd` in result messages
- Backend logs cost per task: `Task ${taskId} cost: $${costUsd.toFixed(4)}`

### Development
- Using Claude Opus for development sessions
- Task swarm waves use multiple concurrent Claude instances

## Infrastructure

### Current (Development)
- Desktop machine running backend + Vite dev server
- Tailscale free tier (up to 100 devices)
- SQLite — zero cost, file-based
- No cloud hosting — everything local

### Future Considerations
- Dedicated server: adds hosting cost but enables always-on access
- Cloud relay: needed if desktop is off and phone wants to check status
- Push notification service: web-push is free (VAPID-based)
