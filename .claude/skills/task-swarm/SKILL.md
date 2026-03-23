---
name: task-swarm
description: Spawn a new AI swarm wave — create worktrees, plan tasks from todos.md, write tasks.json, and output copy-paste prompts for workers and reviewer. Use when the user says "set up swarm", "spawn workers", "next wave", or "start swarm".
disable-model-invocation: false
user-invocable: true
---

# Spawn AI Swarm Wave

You are setting up a new swarm wave. Follow these steps precisely.

## Pre-flight Checks

1. **Verify worktree state:**
   - Run `git status` — if working tree is dirty, that's OK. Worktrees branch from HEAD.
   - Run `git worktree list` — no stale worktrees should exist (run teardown if needed)
   - Check for stale swarm branches: `git branch | grep swarm`

2. **Read current state:**
   - Read `.claude-knowledge/todos.md` to understand available work sets
   - Read the Parallelism Matrix to identify which sets can run together
   - Check the Completed section to know what's already done

## Planning

3. **Select sets for this wave:**
   - Pick 3 sets (one per worker) that have NO file overlap per the Parallelism Matrix
   - If the user specified sets (e.g., "spawn S1 + S3 + S4"), use those
   - Otherwise, select the highest-value conflict-free combination
   - Present the plan to the user for confirmation before proceeding

4. **Research source files:**
   - For each selected set, use Agent (Explore) to read the relevant source files
   - Understand current code state so task descriptions are precise and detailed

5. **Write tasks following the Task Sizing rules (CRITICAL):**
   - Each task MUST represent **30-60 minutes** of agentic work
   - Combine into **full vertical slices**: backend + frontend in ONE task
   - Never create tasks that are just config changes or single-file edits
   - Each worker should have **2-4 tasks** totaling 30-60 min
   - Task descriptions should be 2-3 paragraphs with specific file paths and implementation details
   - Include acceptance criteria that are concrete and verifiable

## Execution

6. **Spawn worktrees:**
   ```bash
   bash scripts/taskswarm/spawn.sh 3
   ```

7. **Write tasks.json** with all planned tasks.

8. **Output copy-paste prompts** for the user:

   ### Worker 1 (`cd ~/projects/claude-remote-worker-1 && claude`)
   ```
   Start working. Read your tasks from /home/caleb/projects/claude-remote/.ai/taskswarm/tasks.json, find tasks assigned to you, and begin implementing them. Follow the workflow in your CLAUDE.md.
   ```

   ### Worker 2 (`cd ~/projects/claude-remote-worker-2 && claude`)
   ```
   Start working. Read your tasks from /home/caleb/projects/claude-remote/.ai/taskswarm/tasks.json, find tasks assigned to you, and begin implementing them. Follow the workflow in your CLAUDE.md.
   ```

   ### Worker 3 (`cd ~/projects/claude-remote-worker-3 && claude`)
   ```
   Start working. Read your tasks from /home/caleb/projects/claude-remote/.ai/taskswarm/tasks.json, find tasks assigned to you, and begin implementing them. Follow the workflow in your CLAUDE.md.
   ```

   ### Reviewer (`cd ~/projects/claude-remote-reviewer && claude`)
   ```
   Start reviewing. Watch /home/caleb/projects/claude-remote/.ai/taskswarm/tasks.json for completed tasks and review/merge them following your CLAUDE.md workflow. Loop until all tasks are merged.
   ```

9. **Show a summary table** of the wave plan:

   | Worker | Set | Tasks | Description |
   |--------|-----|-------|-------------|
   | worker-1 | ... | task-001, task-002 | ... |
   | worker-2 | ... | task-003, task-004 | ... |
   | worker-3 | ... | task-005, task-006 | ... |

10. **Remind the user of the post-wave flow:**
    After workers and reviewer finish: `/task-release`
