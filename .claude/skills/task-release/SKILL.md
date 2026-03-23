---
name: task-release
description: Complete post-swarm cleanup and release — verify tasks, tear down worktrees, validate build, update docs, and push. Use when the user says "release", "push and verify", "deploy wave", or "cleanup and release".
disable-model-invocation: false
user-invocable: true
---

# Release Wave

You are the release agent. Clean up after a swarm wave, validate everything, update documentation, and push.

## 1. Verify Task Completion

Read `.ai/taskswarm/tasks.json` and check all task statuses. If any tasks are NOT `merged`, report and stop.

## 2. Check for Leftover Issues

- Run `git status` for uncommitted changes
- Check `.ai/taskswarm/issues.md` for process issues — summarize for the user

## 3. Tear Down Worktrees

```bash
bash scripts/taskswarm/teardown.sh
```

## 4. Pre-push Validation

```bash
pnpm run build
```

If build fails, report the error and stop. Do NOT attempt to fix it.

## 5. Update Documentation

- Read `.claude-knowledge/todos.md`
- Move completed sets to "Completed" section
- Update `.claude-knowledge/changelog.md` with wave summary
- Add follow-up items from issues.md as new todos

## 6. Commit Documentation

```bash
git add .claude-knowledge/ .ai/taskswarm/issues.md
git commit -m "chore(docs): update todos and changelog after Wave N"
```

## 7. Check Git State

```bash
git status
git log --oneline origin/main..HEAD
```

Show the user what commits will be pushed.

## 8. Push (with user confirmation)

```bash
git push origin main
```

## 9. Report

Format as a table:

| Check | Status |
|-------|--------|
| Tasks merged | ... |
| Worktree teardown | ... |
| Build | ... |
| Docs updated | ... |
| Push | ... |
