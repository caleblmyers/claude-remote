#!/usr/bin/env bash
set -euo pipefail

MAIN_REPO="$(cd "$(dirname "$0")/../.." && pwd)"
TASKS_FILE="$MAIN_REPO/.ai/taskswarm/tasks.json"

if [ ! -f "$TASKS_FILE" ]; then
  echo "No active swarm (tasks.json not found)"
  exit 1
fi

node -e "
const data = JSON.parse(require('fs').readFileSync('$TASKS_FILE', 'utf8'));

const icons = {
  pending: '○',
  in_progress: '◐',
  completed: '●',
  review: '◎',
  merged: '✓',
  blocked: '✗'
};

console.log('=== Swarm Status ===');
console.log('ID:      ' + data.swarmId);
console.log('Created: ' + data.created);
console.log('Workers: ' + data.config.workerCount);
console.log('');

if (data.tasks.length === 0) {
  console.log('No tasks yet. Run the planner to populate tasks.');
  process.exit(0);
}

const counts = {};
data.tasks.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });
console.log('--- Summary ---');
Object.entries(counts).forEach(([s, c]) => {
  console.log('  ' + (icons[s] || '?') + ' ' + s + ': ' + c);
});
console.log('  Total: ' + data.tasks.length);
console.log('');

const byWorker = {};
data.tasks.forEach(t => {
  const w = t.assignee || 'unassigned';
  if (!byWorker[w]) byWorker[w] = [];
  byWorker[w].push(t);
});

console.log('--- By Worker ---');
Object.entries(byWorker).sort().forEach(([worker, tasks]) => {
  console.log(worker + ':');
  tasks.forEach(t => {
    const icon = icons[t.status] || '?';
    const deps = (t.dependsOn || []).length ? ' (depends: ' + t.dependsOn.join(', ') + ')' : '';
    console.log('  ' + icon + ' ' + t.id + ' [' + (t.group || '-') + '] ' + t.title + deps);
  });
});

const inflight = data.tasks.filter(t =>
  t.status === 'in_progress' || t.status === 'completed'
);

if (inflight.length > 1) {
  const overlaps = [];
  for (let i = 0; i < inflight.length; i++) {
    for (let j = i + 1; j < inflight.length; j++) {
      const a = inflight[i];
      const b = inflight[j];
      if (a.assignee === b.assignee) continue;
      const filesA = new Set(a.files || []);
      const shared = (b.files || []).filter(f => filesA.has(f));
      if (shared.length > 0) {
        overlaps.push({ a, b, shared });
      }
    }
  }

  if (overlaps.length > 0) {
    console.log('');
    console.log('--- File Overlap Warnings ---');
    overlaps.forEach(({ a, b, shared }) => {
      shared.forEach(f => {
        console.log('  ⚠ OVERLAP: ' + a.id + ' (' + a.assignee + ') and ' + b.id + ' (' + b.assignee + ') both touch: ' + f);
      });
    });
  }
}
"
