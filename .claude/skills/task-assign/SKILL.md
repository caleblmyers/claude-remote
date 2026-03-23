---
name: task-assign
description: Dynamically add new tasks to a running worker's queue without affecting other workers. Use when a worker finishes early and the user says "assign more tasks to worker-N" or "add tasks for worker-2".
disable-model-invocation: false
user-invocable: true
---

# Assign Tasks to Running Worker

You are adding tasks to a worker that has finished its current tasks while other workers are still active.

## Steps

### 1. Check Current State

Read `.ai/taskswarm/tasks.json` to understand which worker is free, which are active, and what files are being touched.

### 2. Identify File Conflicts

Build a list of ALL files that active workers are touching. These files are OFF LIMITS for new tasks.

### 3. Select Work

Read `.claude-knowledge/todos.md` for available work. Pick items whose files don't overlap with active workers.

### 4. Research and Plan Tasks

Follow Task Sizing rules: 30-60 min, full vertical slices, 2-4 tasks per worker.

### 5. Add Tasks to Queue

Append new tasks to tasks.json WITHOUT modifying existing tasks. Use sequential task IDs continuing from the highest existing ID.

### 6. Confirm

Report what was added — task IDs, titles, files touched, confirming no conflicts.
