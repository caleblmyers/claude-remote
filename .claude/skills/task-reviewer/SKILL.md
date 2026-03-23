---
name: task-reviewer
description: Start reviewing as the swarm reviewer. Watches tasks.json for completed tasks, reviews and merges them. Use when inside the reviewer worktree and the user says "/task-reviewer", "start reviewing", or "begin review".
disable-model-invocation: false
user-invocable: true
---

Start reviewing. Watch /home/caleb/projects/claude-remote/.ai/taskswarm/tasks.json for completed tasks and review/merge them following your CLAUDE.md workflow. Loop until all tasks are merged. Remember: you NEVER write code — send tasks back to workers if anything fails validation.

## Merge Order

Respect task dependencies. If a task has a `dependsOn` array, ALL listed dependencies must be `merged` before you merge that task.

## Validation

The `merge-worker.sh --validate` script runs `pnpm run build`. If the build fails, send the task back to the worker with the specific error.

## Follow-ups

While reviewing, watch for improvements or follow-up work out of scope for the current task. After each merge, check .claude-knowledge/todos.md and append any new ideas to the relevant work set.
