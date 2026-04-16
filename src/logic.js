export const DAY_MS = 1000 * 60 * 60 * 24;

export function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

export function normalizeTask(t, i = 0) {
  const legacyLastDone = Number.isFinite(t.lastDone) ? t.lastDone : null;
  let history;
  if (Array.isArray(t.history)) {
    history = t.history.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  } else if (legacyLastDone != null) {
    history = [legacyLastDone];
  } else {
    history = []; // new tasks start unstarted, not auto-done
  }
  return {
    id: t.id ?? makeId(),
    name: t.name ?? 'Untitled',
    intervalMin: Math.max(1, Number(t.intervalMin) || 1),
    intervalMax: Math.max(
      Math.max(1, Number(t.intervalMin) || 1),
      Number(t.intervalMax) || Number(t.intervalMin) || 1
    ),
    notes: typeof t.notes === 'string' ? t.notes : '',
    history,
    order: Number.isFinite(t.order) ? t.order : i,
    snoozedUntil: Number.isFinite(t.snoozedUntil) ? t.snoozedUntil : null,
  };
}

export function lastDoneOf(task) {
  return task.history.length > 0 ? task.history[task.history.length - 1] : null;
}

/** Zero out to local midnight. */
function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Calendar-day difference between two timestamps in local time.
 *  e.g. lastDone at 11pm yesterday, now 8am today -> 1 (not 0). */
export function daysSince(ts, now) {
  return Math.round((startOfDay(now) - startOfDay(ts)) / DAY_MS);
}

export function isSnoozed(task, now) {
  return !!(task.snoozedUntil && task.snoozedUntil > now);
}

export function stateFor(task, now) {
  if (isSnoozed(task, now)) return 'snoozed';
  const last = lastDoneOf(task);
  if (last == null) return 'unstarted';
  const d = daysSince(last, now);
  if (d >= task.intervalMax) return 'due';
  if (d >= task.intervalMin) return 'approaching';
  return 'fresh';
}

/** 0..1 progress toward approaching/due within the fresh range.
 *  Used by the UI to warm up the accent as a fresh task ages. */
export function freshProgress(task, now) {
  const last = lastDoneOf(task);
  if (last == null) return 0;
  const d = daysSince(last, now);
  if (d >= task.intervalMin) return 1;
  return Math.max(0, Math.min(1, d / task.intervalMin));
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
  if (last == null) {
    return `not started yet · every ${rangeText(task)}`;
  }
  const d = daysSince(last, now);
  const date = shortDate(last);
  if (d === 0) return `done today · every ${rangeText(task)}`;
  if (d === 1) return `1 day ago · ${date} · every ${rangeText(task)}`;
  return `${d} days ago · ${date} · every ${rangeText(task)}`;
}

/** Stats about a task's completion history — purely descriptive. */
export function completionStats(task) {
  const h = task.history || [];
  if (h.length < 2) {
    return { count: h.length, avgDays: null };
  }
  const gaps = [];
  for (let i = 1; i < h.length; i++) {
    gaps.push((h[i] - h[i - 1]) / DAY_MS);
  }
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return { count: h.length, avgDays: Math.round(avg * 10) / 10 };
}

/** Plain-English summary of the whole list. */
export function listSummary(groups) {
  const u = (groups.unstarted || []).length;
  const n = groups.needsAttention.length;
  const s = groups.snoozed.length;
  const parts = [];
  if (u > 0) parts.push(`${u} not started`);
  if (n > 0) parts.push(`${n} ${n === 1 ? 'thing' : 'things'} could use attention`);
  if (s > 0) parts.push(`${s} snoozed`);
  if (parts.length === 0) {
    return (groups.resting || []).length > 0 ? 'Everything is resting.' : 'No tasks yet.';
  }
  return parts.join(' · ');
}

export function groupTasks(tasks, now) {
  const withState = tasks.map((t) => ({ task: t, state: stateFor(t, now) }));
  const stateOrder = { unstarted: -1, due: 0, approaching: 1, fresh: 2, snoozed: 3 };
  withState.sort((a, b) => {
    if (stateOrder[a.state] !== stateOrder[b.state]) {
      return stateOrder[a.state] - stateOrder[b.state];
    }
    if (a.task.order !== b.task.order) return a.task.order - b.task.order;
    const aLast = lastDoneOf(a.task) ?? now;
    const bLast = lastDoneOf(b.task) ?? now;
    return daysSince(bLast, now) - daysSince(aLast, now);
  });
  return {
    unstarted: withState.filter((x) => x.state === 'unstarted'),
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

export function seedTasks() {
  // Starter tasks come in unstarted — the user taps each for the first time
  // when they do it, so the clock reflects reality instead of "installed today".
  return STARTER_TASKS.map((t, i) =>
    normalizeTask({ id: makeId(), ...t, history: [], order: i })
  );
}
