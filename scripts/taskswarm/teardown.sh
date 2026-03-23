#!/usr/bin/env bash
set -euo pipefail

MAIN_REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PARENT_DIR="$(dirname "$MAIN_REPO")"
REPO_NAME="$(basename "$MAIN_REPO")"

echo "=== Tearing down swarm ==="

# Clean up task swarm artifacts (keep README and prompts)
rm -f "$MAIN_REPO/.ai/taskswarm/tasks"*.json "$MAIN_REPO/.ai/taskswarm/issues.md" 2>/dev/null && echo "Removed task swarm artifacts" || true

# Remove worker worktrees
for dir in "$PARENT_DIR/${REPO_NAME}"-worker-*; do
  [ -d "$dir" ] || continue
  WORKER_NAME="$(basename "$dir")"
  BRANCH="swarm/${WORKER_NAME#${REPO_NAME}-}"
  echo "Removing worktree: $dir"
  git -C "$MAIN_REPO" worktree remove --force "$dir" 2>/dev/null || rm -rf "$dir"
  git -C "$MAIN_REPO" branch -D "$BRANCH" 2>/dev/null || true
done

# Remove reviewer worktree
REVIEWER_DIR="$PARENT_DIR/${REPO_NAME}-reviewer"
if [ -d "$REVIEWER_DIR" ]; then
  echo "Removing worktree: $REVIEWER_DIR"
  git -C "$MAIN_REPO" worktree remove --force "$REVIEWER_DIR" 2>/dev/null || rm -rf "$REVIEWER_DIR"
  git -C "$MAIN_REPO" branch -D "swarm/reviewer" 2>/dev/null || true
fi

git -C "$MAIN_REPO" worktree prune

echo ""
echo "=== Swarm torn down ==="
echo "Remaining worktrees:"
git -C "$MAIN_REPO" worktree list
