---
name: task-status
description: Show the current status of all swarm tasks, workers, and any blockers. Use when the user asks "swarm status", "how are workers doing", "check swarm", or "task status".
disable-model-invocation: false
user-invocable: true
---

# Swarm Status Check

Show a quick, comprehensive view of the current swarm state.

## Gather Data

1. **Task statuses:**
```bash
bash scripts/taskswarm/status.sh
```

2. **Worktree status:**
```bash
git worktree list
```

3. **Process issues** (if any):
```bash
cat .ai/taskswarm/issues.md 2>/dev/null | tail -30
```

4. **Recent commits on main:**
```bash
git log --oneline -5
```

## Format Output

Present as a clear, scannable report with worker status (Done/Working/Awaiting review/Blocked/Idle).
