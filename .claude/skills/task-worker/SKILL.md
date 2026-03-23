---
name: task-worker
description: Start working as a swarm worker. Reads tasks.json, finds tasks assigned to this worker, and implements them. Use when inside a worker worktree and the user says "/task-worker", "start working", or "begin tasks".
disable-model-invocation: false
user-invocable: true
---

Start working. Read your tasks from /home/caleb/projects/claude-remote/.ai/taskswarm/tasks.json, find tasks assigned to you, and begin implementing them. Follow the workflow in your CLAUDE.md. After completing each task, run `pnpm run build` to validate before marking complete.

## Task Dependencies

Before starting a task, check its `dependsOn` array. ALL listed dependencies must have `status === "merged"` before you can start. If dependencies aren't merged yet, skip to your next task or wait and re-check tasks.json.

## Task Parallelism (Don't Wait Idle)

After completing a task and marking it "completed", check if you have another pending task whose `dependsOn` are all merged. Compare the `files` arrays:
- **No file overlap** -> Start the next task immediately.
- **Files overlap** -> Wait for the previous task to be merged first.

## Review Feedback Loop

When you have no remaining pending tasks but some are still waiting for review, do NOT exit. Poll tasks.json every 30 seconds. If the reviewer sends a task back (status "in_progress" with reviewNotes), fix the issues and mark completed again. Only exit once ALL of your tasks are "merged".
