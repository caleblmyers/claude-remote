# AI Swarm Orchestration

Multi-agent parallel development system for Claude Remote.

## Architecture

```
Planner (main repo)     → reads todos.md, creates tasks.json
Worker 1 (worktree)     → implements assigned tasks
Worker 2 (worktree)     → implements assigned tasks
Worker 3 (worktree)     → implements assigned tasks
Reviewer (worktree)     → reviews, validates, merges to main
```

Each worker runs in an isolated git worktree on its own branch. Workers never push — the reviewer handles all merging.

## Prerequisites

- pnpm installed
- Git worktree support (standard git)

## Quick Start

1. **Spawn:** `bash scripts/taskswarm/spawn.sh 3`
2. **Plan:** Open main repo terminal, run `claude`, use `/task-swarm`
3. **Work:** Open each worker terminal, run `claude`, use `/task-worker`
4. **Review:** Open reviewer terminal, run `claude`, use `/task-reviewer`
5. **Monitor:** `bash scripts/taskswarm/status.sh`
6. **Release:** After all tasks merged, use `/task-release` in main repo

## Task Lifecycle

```
pending → in_progress → completed → review → merged
              ↓                        ↓
           blocked              in_progress (with reviewNotes)
```

## Task JSON Schema

```json
{
  "id": "task-001",
  "group": "S1",
  "title": "Fix streaming output",
  "description": "Detailed implementation instructions...",
  "files": ["backend/src/agent/index.ts", "app/src/screens/TaskDetail/index.tsx"],
  "acceptanceCriteria": ["pnpm build passes", "streaming works end-to-end"],
  "dependsOn": [],
  "status": "pending",
  "assignee": "worker-1"
}
```

## Helper Scripts

| Script | Purpose |
|--------|---------|
| `scripts/taskswarm/spawn.sh [N]` | Create N worker worktrees + 1 reviewer |
| `scripts/taskswarm/teardown.sh` | Remove all swarm worktrees |
| `scripts/taskswarm/task-update.sh <id> <status>` | Update task status |
| `scripts/taskswarm/merge-worker.sh <branch> [--validate]` | Merge worker branch |
| `scripts/taskswarm/status.sh` | Show swarm status |
| `scripts/taskswarm/validate-tasks.sh` | Validate task file assignments |

## Parallel Execution Model

- Workers run independently in isolated worktrees
- File overlap between workers is forbidden (planner ensures this)
- Within a worker, tasks can run in parallel if their files don't overlap
- Reviewer merges in dependency order

## Limitations

- Max 5 workers (worktree overhead)
- File-level conflict detection only (not line-level)
- Workers must rebase before each new task
