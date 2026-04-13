export const DAY_MS = 1000 * 60 * 60 * 24;

export function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

export function normalizeTask(t, i = 0) {
  const legacyLastDone = Number.isFinite(t.lastDone) ? t.lastDone : null;
  let history;
  if (Array.isArray(t.history) && t.history.length > 0) {
    history = t.history.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  } else if (legacyLastDone != null) {
    history = [legacyLastDone];
  } else {
    history = [Date.now()];
  }
  return {
    id: t.id ?? makeId(),
    name: t.name ?? 'Untitled',
    intervalMin: Math.max(1, Number(t.intervalMin) || 1),
    intervalMax: Math.max(
      Math.max(1, Number(t.intervalMin) || 1),
      Number(t.intervalMax) || Number(t.intervalMin) || 1
    ),
    history,
    order: Number.isFinite(t.order) ? t.order : i,
    snoozedUntil: Number.isFinite(t.snoozedUntil) ? t.snoozedUntil : null,
  };
}

export function lastDoneOf(task) {
  return task.history[task.history.length - 1] ?? Date.now();
}

export function daysSince(ts, now) {
  return Math.floor((now - ts) / DAY_MS);
}

export function isSnoozed(task, now) {
  return !!(task.snoozedUntil && task.snoozedUntil > now);
}

export function stateFor(task, now) {
  if (isSnoozed(task, now)) return 'snoozed';
  const d = daysSince(lastDoneOf(task), now);
  if (d >= task.intervalMax) return 'due';
  if (d >= task.intervalMin) return 'approaching';
  return 'fresh';
}

export function rangeText(task) {
  if (task.intervalMin === task.intervalMax) return `${task.intervalMin}d`;
  return `${task.intervalMin}–${task.intervalMax}d`;
}

export function shortDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function metaText(task, now) {
  if (isSnoozed(task, now)) {
    return `snoozed until ${shortDate(task.snoozedUntil)} · every ${rangeText(task)}`;
  }
  const last = lastDoneOf(task);
  const d = daysSince(last, now);
  const date = shortDate(last);
  if (d === 0) return `done today · every ${rangeText(task)}`;
  if (d === 1) return `1 day ago · ${date} · every ${rangeText(task)}`;
  return `${d} days ago · ${date} · every ${rangeText(task)}`;
}

export function groupTasks(tasks, now) {
  const withState = tasks.map((t) => ({ task: t, state: stateFor(t, now) }));
  const stateOrder = { due: 0, approaching: 1, fresh: 2, snoozed: 3 };
  withState.sort((a, b) => {
    if (stateOrder[a.state] !== stateOrder[b.state]) {
      return stateOrder[a.state] - stateOrder[b.state];
    }
    if (a.task.order !== b.task.order) return a.task.order - b.task.order;
    return daysSince(lastDoneOf(b.task), now) - daysSince(lastDoneOf(a.task), now);
  });
  return {
    needsAttention: withState.filter((x) => x.state === 'due' || x.state === 'approaching'),
    resting: withState.filter((x) => x.state === 'fresh'),
    snoozed: withState.filter((x) => x.state === 'snoozed'),
  };
}

/** Reorder helper: swap task with id and neighbour in `direction`. Re-indexes order. */
export function reorderTasks(tasks, id, direction) {
  const i = tasks.findIndex((t) => t.id === id);
  if (i === -1) return tasks;
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= tasks.length) return tasks;
  const copy = [...tasks];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy.map((t, k) => ({ ...t, order: k }));
}

export const STARTER_TASKS = [
  { name: 'Laundry', intervalMin: 10, intervalMax: 14 },
  { name: 'Vacuum', intervalMin: 1, intervalMax: 2 },
  { name: 'Groceries', intervalMin: 5, intervalMax: 7 },
  { name: 'Batch cook & freeze meals', intervalMin: 10, intervalMax: 14 },
  { name: 'Clean litter robot', intervalMin: 3, intervalMax: 5 },
  { name: 'Take out trash', intervalMin: 5, intervalMax: 7 },
  { name: 'Wipe down surfaces', intervalMin: 5, intervalMax: 7 },
  { name: 'Water plants', intervalMin: 5, intervalMax: 7 },
];

export function seedTasks(now = Date.now()) {
  return STARTER_TASKS.map((t, i) =>
    normalizeTask({ id: makeId(), ...t, history: [now], order: i })
  );
}
