---
name: push-ready
description: Verify the codebase is safe to push — run all validation checks and show what commits will be pushed. Use when the user asks "am I ready to push", "can I push", "verify build", or "check before push".
disable-model-invocation: false
user-invocable: true
---

# Push Readiness Check

Verify that the current main branch is safe to push to remote.

## Run All Checks

1. **Build (backend + frontend):**
```bash
pnpm run build
```

2. **Working tree clean:**
```bash
git status
```

3. **Commits to push:**
```bash
git log --oneline origin/main..HEAD
```

4. **Any active worktrees:**
```bash
git worktree list
```

## Report

| Check | Status |
|-------|--------|
| Build | ... |
| Working tree | ... |
| Worktrees | ... |

### Commits to push (N):
[list]

### Verdict
Safe to push / NOT safe — [failures]
