#!/usr/bin/env bash
set -euo pipefail

MAIN_REPO="$(cd "$(dirname "$0")/../.." && pwd)"
WORKER_COUNT="${1:-3}"
MAX_WORKERS=5
SWARM_ID="swarm-$(date +%Y%m%d-%H%M%S)"
TASKS_FILE="$MAIN_REPO/.ai/taskswarm/tasks.json"
PROMPTS_DIR="$MAIN_REPO/.ai/taskswarm/prompts"
PARENT_DIR="$(dirname "$MAIN_REPO")"
REPO_NAME="$(basename "$MAIN_REPO")"

if [ "$WORKER_COUNT" -gt "$MAX_WORKERS" ]; then
  echo "Error: max $MAX_WORKERS workers allowed"
  exit 1
fi

if [ "$WORKER_COUNT" -lt 1 ]; then
  echo "Error: need at least 1 worker"
  exit 1
fi

# Warn if working tree is dirty
if ! git -C "$MAIN_REPO" diff --quiet || ! git -C "$MAIN_REPO" diff --cached --quiet; then
  echo "Warning: working tree has uncommitted changes."
  echo "  Worktrees will branch from HEAD (last commit) — uncommitted changes are excluded."
  echo ""
fi

echo "=== Spawning swarm: $SWARM_ID ==="
echo "Main repo: $MAIN_REPO"
echo "Workers: $WORKER_COUNT"
echo ""

# Create worker worktrees
for i in $(seq 1 "$WORKER_COUNT"); do
  WORKER_DIR="$PARENT_DIR/${REPO_NAME}-worker-$i"
  BRANCH="swarm/worker-$i"

  if [ -d "$WORKER_DIR" ]; then
    echo "Warning: $WORKER_DIR already exists, skipping"
    continue
  fi

  echo "Creating worker-$i worktree..."
  git -C "$MAIN_REPO" worktree add -b "$BRANCH" "$WORKER_DIR" HEAD

  # Install dependencies
  echo "Installing dependencies for worker-$i..."
  (cd "$WORKER_DIR" && pnpm install --frozen-lockfile --prefer-offline 2>/dev/null) || true

  # Grant full tool permissions (workers run unattended)
  mkdir -p "$WORKER_DIR/.claude"
  cat > "$WORKER_DIR/.claude/settings.json" << 'SETTINGS_EOF'
{
  "permissions": {
    "allow": [
      "Bash(*)",
      "Read(*)",
      "Write(*)",
      "Edit(*)",
      "Glob(*)",
      "Grep(*)",
      "WebFetch(*)",
      "WebSearch(*)"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(git push *)",
      "Bash(git reset --hard *)",
      "Bash(git clean *)"
    ]
  }
}
SETTINGS_EOF
  git -C "$WORKER_DIR" update-index --assume-unchanged .claude/settings.json 2>/dev/null || true

  # Write role prompt
  if [ -f "$PROMPTS_DIR/worker.md" ]; then
    PROMPT=$(sed \
      -e "s|{{WORKER_ID}}|worker-$i|g" \
      -e "s|{{MAIN_REPO}}|$MAIN_REPO|g" \
      -e "s|{{BRANCH}}|$BRANCH|g" \
      "$PROMPTS_DIR/worker.md")
    printf '%s\n' "$PROMPT" > "$WORKER_DIR/.claude/swarm-role.md"
    printf '\n\n<!-- swarm-role -->\n---\n\n%s\n' "$PROMPT" >> "$WORKER_DIR/CLAUDE.md"
    git -C "$WORKER_DIR" update-index --assume-unchanged CLAUDE.md 2>/dev/null || true
  fi

  echo "  -> $WORKER_DIR (branch: $BRANCH)"
done

# Create reviewer worktree
REVIEWER_DIR="$PARENT_DIR/${REPO_NAME}-reviewer"
REVIEWER_BRANCH="swarm/reviewer"

if [ -d "$REVIEWER_DIR" ]; then
  echo "Warning: $REVIEWER_DIR already exists, skipping"
else
  echo "Creating reviewer worktree..."
  git -C "$MAIN_REPO" worktree add -b "$REVIEWER_BRANCH" "$REVIEWER_DIR" HEAD

  (cd "$REVIEWER_DIR" && pnpm install --frozen-lockfile --prefer-offline 2>/dev/null) || true

  mkdir -p "$REVIEWER_DIR/.claude"
  cat > "$REVIEWER_DIR/.claude/settings.json" << 'SETTINGS_EOF'
{
  "permissions": {
    "allow": [
      "Bash(*)",
      "Read(*)",
      "Write(*)",
      "Edit(*)",
      "Glob(*)",
      "Grep(*)",
      "WebFetch(*)",
      "WebSearch(*)"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(git push *)",
      "Bash(git reset --hard *)",
      "Bash(git clean *)"
    ]
  }
}
SETTINGS_EOF
  git -C "$REVIEWER_DIR" update-index --assume-unchanged .claude/settings.json 2>/dev/null || true

  if [ -f "$PROMPTS_DIR/reviewer.md" ]; then
    PROMPT=$(sed \
      -e "s|{{MAIN_REPO}}|$MAIN_REPO|g" \
      "$PROMPTS_DIR/reviewer.md")
    printf '%s\n' "$PROMPT" > "$REVIEWER_DIR/.claude/swarm-role.md"
    printf '\n\n<!-- swarm-role -->\n---\n\n%s\n' "$PROMPT" >> "$REVIEWER_DIR/CLAUDE.md"
    git -C "$REVIEWER_DIR" update-index --assume-unchanged CLAUDE.md 2>/dev/null || true
  fi

  echo "  -> $REVIEWER_DIR (branch: $REVIEWER_BRANCH)"
fi

# Initialize tasks.json
echo "Initializing task queue..."
node -e "
const data = {
  version: 1,
  created: new Date().toISOString(),
  swarmId: '$SWARM_ID',
  config: {
    mainRepo: '$MAIN_REPO',
    workerCount: $WORKER_COUNT,
    groups: []
  },
  tasks: []
};
require('fs').writeFileSync('$TASKS_FILE', JSON.stringify(data, null, 2) + '\n');
"

echo ""
echo "=== Swarm ready ==="
echo "Task queue: $TASKS_FILE"
echo ""
echo "Next steps:"
echo "  1. Open a terminal in $MAIN_REPO and run 'claude' (planner)"
echo "  2. Open terminals in each worker dir and run 'claude'"
echo "  3. Open a terminal in $REVIEWER_DIR and run 'claude'"
echo "  4. Monitor: bash $MAIN_REPO/scripts/taskswarm/status.sh"
