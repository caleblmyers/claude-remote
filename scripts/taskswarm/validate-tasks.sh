#!/usr/bin/env bash
set -euo pipefail

# Usage: validate-tasks.sh [tasks.json]
MAIN_REPO="$(cd "$(dirname "$0")/../.." && pwd)"
TASKS_FILE="${1:-$MAIN_REPO/.ai/taskswarm/tasks.json}"

if [ ! -f "$TASKS_FILE" ]; then
  echo "Error: tasks file not found: $TASKS_FILE"
  exit 1
fi

echo "=== Validating task file assignments ==="
echo "Tasks file: $TASKS_FILE"
echo ""

ERRORS=0
WARNINGS=0

TASK_DATA=$(node -e "
const tasks = JSON.parse(require('fs').readFileSync('$TASKS_FILE', 'utf8')).tasks;
tasks.forEach(t => {
  console.log(JSON.stringify({ id: t.id, assignee: t.assignee, files: t.files || [] }));
});
")

declare -A FILE_OWNERS

echo "--- File existence check ---"
while IFS= read -r line; do
  TASK_ID=$(echo "$line" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));process.stdout.write(d.id)")
  ASSIGNEE=$(echo "$line" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));process.stdout.write(d.assignee)")
  FILES=$(echo "$line" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));d.files.forEach(f=>console.log(f))")

  while IFS= read -r filepath; do
    [ -z "$filepath" ] && continue
    FULL_PATH="$MAIN_REPO/$filepath"

    if [ ! -f "$FULL_PATH" ]; then
      PARENT_DIR=$(dirname "$FULL_PATH")
      CHECK_DIR="$PARENT_DIR"
      DEPTH=0
      while [ "$CHECK_DIR" != "$MAIN_REPO" ] && [ ! -d "$CHECK_DIR" ]; do
        CHECK_DIR=$(dirname "$CHECK_DIR")
        DEPTH=$((DEPTH + 1))
      done
      if [ "$DEPTH" -gt 3 ]; then
        echo "  ERROR  $TASK_ID ($ASSIGNEE): $filepath — path looks invalid (typo?)"
        ERRORS=$((ERRORS + 1))
      elif [ ! -d "$PARENT_DIR" ]; then
        echo "  WARN   $TASK_ID ($ASSIGNEE): $filepath — new directory will be created"
        WARNINGS=$((WARNINGS + 1))
      else
        echo "  NEW    $TASK_ID ($ASSIGNEE): $filepath — file will be created"
      fi
    else
      echo "  OK     $TASK_ID ($ASSIGNEE): $filepath"
    fi

    KEY="$filepath"
    if [ -n "${FILE_OWNERS[$KEY]:-}" ]; then
      EXISTING="${FILE_OWNERS[$KEY]}"
      EXISTING_WORKER=$(echo "$EXISTING" | cut -d'|' -f2)
      if [ "$EXISTING_WORKER" != "$ASSIGNEE" ]; then
        FILE_OWNERS["$KEY"]="${EXISTING},$TASK_ID|$ASSIGNEE"
      else
        FILE_OWNERS["$KEY"]="${EXISTING},$TASK_ID|$ASSIGNEE"
      fi
    else
      FILE_OWNERS["$KEY"]="$TASK_ID|$ASSIGNEE"
    fi
  done <<< "$FILES"
done <<< "$TASK_DATA"

echo ""
echo "--- Dependency reference check ---"
DEP_ERRORS=$(node -e "
const tasks = JSON.parse(require('fs').readFileSync('$TASKS_FILE', 'utf8')).tasks;
const ids = new Set(tasks.map(function(t) { return t.id; }));
var errors = 0;
tasks.forEach(function(t) {
  var deps = t.dependsOn || [];
  deps.forEach(function(dep) {
    if (!ids.has(dep)) {
      console.log('  ERROR  ' + t.id + ' depends on ' + dep + ' — not found in task list');
      errors++;
    }
    if (dep === t.id) {
      console.log('  ERROR  ' + t.id + ' depends on itself');
      errors++;
    }
  });
});
if (errors === 0) console.log('  All dependency references valid.');
process.exit(errors > 0 ? 1 : 0);
" 2>&1) || ERRORS=$((ERRORS + $(echo "$DEP_ERRORS" | grep -c 'ERROR' || true)))
echo "$DEP_ERRORS"

echo ""
echo "--- Cross-worker file conflicts ---"
CONFLICTS=0
for filepath in "${!FILE_OWNERS[@]}"; do
  OWNERS="${FILE_OWNERS[$filepath]}"
  WORKERS=$(echo "$OWNERS" | tr ',' '\n' | cut -d'|' -f2 | sort -u)
  WORKER_COUNT=$(echo "$WORKERS" | wc -l)
  if [ "$WORKER_COUNT" -gt 1 ]; then
    echo "  CONFLICT: $filepath"
    echo "    Assigned to: $OWNERS"
    CONFLICTS=$((CONFLICTS + 1))
    ERRORS=$((ERRORS + 1))
  fi
done
if [ "$CONFLICTS" -eq 0 ]; then
  echo "  No cross-worker file conflicts found."
fi

echo ""
echo "=== Summary ==="
echo "  Errors:   $ERRORS"
echo "  Warnings: $WARNINGS"

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "Fix errors before starting the swarm."
  exit 1
fi

echo "All checks passed."
