#!/usr/bin/env bash
set -euo pipefail

# Usage: merge-worker.sh <worker-branch> [--validate]
MAIN_REPO="$(cd "$(dirname "$0")/../.." && pwd)"

if [ $# -lt 1 ]; then
  echo "Usage: merge-worker.sh <branch> [--validate]"
  echo ""
  echo "Examples:"
  echo "  merge-worker.sh swarm/worker-1"
  echo "  merge-worker.sh swarm/worker-1 --validate"
  exit 1
fi

BRANCH="$1"
VALIDATE=false
[ "${2:-}" = "--validate" ] && VALIDATE=true

echo "=== Merging $BRANCH into main ==="

CURRENT=$(git -C "$MAIN_REPO" branch --show-current)
if [ "$CURRENT" != "main" ]; then
  echo "Error: main repo is on branch '$CURRENT', expected 'main'"
  exit 1
fi

echo "Commits to merge:"
git -C "$MAIN_REPO" log --oneline "main..$BRANCH" 2>/dev/null || {
  echo "Error: branch '$BRANCH' not found"
  exit 1
}
echo ""

if [ "$VALIDATE" = true ]; then
  echo "Running validation..."
  git -C "$MAIN_REPO" merge --no-commit --no-ff "$BRANCH" 2>/dev/null || {
    echo "Error: merge conflicts detected"
    git -C "$MAIN_REPO" merge --abort
    exit 1
  }

  # Install deps if package.json changed
  if git -C "$MAIN_REPO" diff --cached --name-only | grep -q 'package.json'; then
    echo "package.json changes detected — running pnpm install..."
    if ! (cd "$MAIN_REPO" && pnpm install --frozen-lockfile 2>&1 || pnpm install 2>&1); then
      echo "pnpm install failed — aborting merge"
      git -C "$MAIN_REPO" merge --abort
      exit 1
    fi
  fi

  if ! (cd "$MAIN_REPO" && pnpm run build 2>&1); then
    echo "Build failed — aborting merge"
    git -C "$MAIN_REPO" merge --abort
    exit 1
  fi

  git -C "$MAIN_REPO" merge --abort
fi

# Check if worker branch has diverged from main
DIVERGED=$(git -C "$MAIN_REPO" rev-list --count "$BRANCH"..HEAD 2>/dev/null || echo "0")

if [ "$DIVERGED" -gt 0 ]; then
  echo "Worker branch is behind main by $DIVERGED commit(s) — using cherry-pick."
  COMMITS=$(git -C "$MAIN_REPO" rev-list --reverse "main..$BRANCH")
  if [ -z "$COMMITS" ]; then
    echo "No commits to cherry-pick."
    exit 0
  fi
  for COMMIT in $COMMITS; do
    git -C "$MAIN_REPO" cherry-pick --no-commit "$COMMIT" || {
      echo "Error: cherry-pick conflict on $COMMIT. Resolve manually."
      git -C "$MAIN_REPO" cherry-pick --abort 2>/dev/null || true
      exit 1
    }
  done
else
  git -C "$MAIN_REPO" merge --squash "$BRANCH" || {
    echo "Error: merge conflicts. Resolve manually or ask the worker to rebase."
    git -C "$MAIN_REPO" merge --abort 2>/dev/null || true
    exit 1
  }
fi

# Strip swarm role content from CLAUDE.md if present
CLAUDE_MD="$MAIN_REPO/CLAUDE.md"
if [ -f "$CLAUDE_MD" ] && grep -q '<!-- swarm-role -->' "$CLAUDE_MD"; then
  echo "Stripping swarm role content from CLAUDE.md..."
  sed -i '/<!-- swarm-role -->/,$d' "$CLAUDE_MD"
  sed -i -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$CLAUDE_MD"
  git -C "$MAIN_REPO" add CLAUDE.md
fi

echo ""
echo "Squash merge staged. Review with 'git diff --cached' then commit."
echo "Suggested: git commit -m 'swarm(<worker>): [task-XXX] description'"
