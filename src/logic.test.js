import { describe, it, expect } from 'vitest';
import {
  DAY_MS,
  normalizeTask,
  lastDoneOf,
  daysSince,
  isSnoozed,
  stateFor,
  metaText,
  groupTasks,
  reorderTasks,
  completionStats,
  listSummary,
} from './logic.js';

const now = new Date('2026-04-13T12:00:00Z').getTime();

function t(overrides = {}) {
  return normalizeTask({
    id: 'a',
    name: 'Laundry',
    intervalMin: 10,
    intervalMax: 14,
    history: [now],
    order: 0,
    ...overrides,
  });
}

describe('normalizeTask', () => {
  it('back-fills history from legacy lastDone', () => {
    const task = normalizeTask({ name: 'x', intervalMin: 1, intervalMax: 2, lastDone: now });
    expect(task.history).toEqual([now]);
  });

  it('leaves history empty when no history and no legacy lastDone', () => {
    const task = normalizeTask({ name: 'x', intervalMin: 1, intervalMax: 2 });
    expect(task.history).toEqual([]);
  });

  it('preserves an empty history array explicitly', () => {
    const task = normalizeTask({ name: 'x', intervalMin: 1, intervalMax: 2, history: [] });
    expect(task.history).toEqual([]);
  });

  it('sorts history ascending', () => {
    const task = normalizeTask({ name: 'x', intervalMin: 1, intervalMax: 2, history: [30, 10, 20] });
    expect(task.history).toEqual([10, 20, 30]);
  });

  it('ensures intervalMax >= intervalMin', () => {
    const task = normalizeTask({ name: 'x', intervalMin: 5, intervalMax: 2 });
    expect(task.intervalMax).toBe(5);
  });

  it('coerces missing intervals to 1', () => {
    const task = normalizeTask({ name: 'x' });
    expect(task.intervalMin).toBe(1);
    expect(task.intervalMax).toBe(1);
  });
});

describe('unstarted state', () => {
  it('stateFor returns "unstarted" for tasks with empty history', () => {
    expect(stateFor(t({ history: [] }), now)).toBe('unstarted');
  });

  it('lastDoneOf returns null for empty history', () => {
    expect(lastDoneOf(t({ history: [] }))).toBeNull();
  });

  it('metaText for unstarted tasks says "not started yet"', () => {
    expect(metaText(t({ history: [] }), now)).toMatch(/not started yet/);
  });

  it('groupTasks puts unstarted items in their own bucket', () => {
    const u = t({ id: 'u', history: [] });
    const f = t({ id: 'f', history: [now] });
    const g = groupTasks([u, f], now);
    expect(g.unstarted.map((x) => x.task.id)).toEqual(['u']);
    expect(g.resting.map((x) => x.task.id)).toEqual(['f']);
  });
});

describe('stateFor', () => {
  it('is fresh right after completion', () => {
    expect(stateFor(t({ history: [now] }), now)).toBe('fresh');
  });

  it('is approaching between min and max', () => {
    expect(stateFor(t({ history: [now - 11 * DAY_MS] }), now)).toBe('approaching');
  });

  it('is due at or past max', () => {
    expect(stateFor(t({ history: [now - 14 * DAY_MS] }), now)).toBe('due');
    expect(stateFor(t({ history: [now - 30 * DAY_MS] }), now)).toBe('due');
  });

  it('is snoozed when snoozedUntil is in the future, regardless of age', () => {
    expect(
      stateFor(
        t({ history: [now - 30 * DAY_MS], snoozedUntil: now + DAY_MS }),
        now
      )
    ).toBe('snoozed');
  });

  it('resumes normal state once snooze expires', () => {
    expect(
      stateFor(
        t({ history: [now - 30 * DAY_MS], snoozedUntil: now - DAY_MS }),
        now
      )
    ).toBe('due');
  });
});

describe('lastDoneOf', () => {
  it('returns most recent history entry', () => {
    const task = t({ history: [now - 5 * DAY_MS, now - 2 * DAY_MS, now - DAY_MS] });
    expect(lastDoneOf(task)).toBe(now - DAY_MS);
  });
});

describe('metaText', () => {
  it('says "done today" when daysSince is 0', () => {
    expect(metaText(t({ history: [now] }), now)).toContain('done today');
  });

  it('says "1 day ago" for one day', () => {
    expect(metaText(t({ history: [now - DAY_MS] }), now)).toContain('1 day ago');
  });

  it('says "N days ago" for more', () => {
    expect(metaText(t({ history: [now - 5 * DAY_MS] }), now)).toContain('5 days ago');
  });

  it('indicates snooze', () => {
    expect(
      metaText(t({ snoozedUntil: now + 2 * DAY_MS, history: [now] }), now)
    ).toContain('snoozed');
  });
});

describe('groupTasks', () => {
  it('splits into unstarted / needsAttention / resting / snoozed', () => {
    const fresh = t({ id: 'f', history: [now] });
    const approaching = t({ id: 'a', history: [now - 11 * DAY_MS] });
    const due = t({ id: 'd', history: [now - 20 * DAY_MS] });
    const snoozed = t({ id: 's', history: [now - 20 * DAY_MS], snoozedUntil: now + DAY_MS });
    const unstarted = t({ id: 'u', history: [] });
    const g = groupTasks([fresh, approaching, due, snoozed, unstarted], now);
    expect(g.unstarted.map((x) => x.task.id)).toEqual(['u']);
    expect(g.needsAttention.map((x) => x.task.id)).toEqual(['d', 'a']);
    expect(g.resting.map((x) => x.task.id)).toEqual(['f']);
    expect(g.snoozed.map((x) => x.task.id)).toEqual(['s']);
  });
});

describe('reorderTasks', () => {
  const a = t({ id: 'a', order: 0 });
  const b = t({ id: 'b', order: 1 });
  const c = t({ id: 'c', order: 2 });

  it('moves up', () => {
    const moved = reorderTasks([a, b, c], 'c', 'up');
    expect(moved.map((x) => x.id)).toEqual(['a', 'c', 'b']);
    expect(moved.map((x) => x.order)).toEqual([0, 1, 2]);
  });

  it('moves down', () => {
    const moved = reorderTasks([a, b, c], 'a', 'down');
    expect(moved.map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('is a no-op at edges', () => {
    expect(reorderTasks([a, b, c], 'a', 'up').map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(reorderTasks([a, b, c], 'c', 'down').map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('isSnoozed / daysSince', () => {
  it('isSnoozed returns false when snoozedUntil is null', () => {
    expect(isSnoozed(t({ snoozedUntil: null }), now)).toBe(false);
  });

  it('daysSince counts calendar days, not 24h blocks', () => {
    // Same local day → 0
    expect(daysSince(now - 1000, now)).toBe(0);
    // One calendar day apart (a bit less than 24h can still be "yesterday")
    expect(daysSince(now - DAY_MS + 1000, now)).toBe(1);
    // Five days ago
    expect(daysSince(now - 5 * DAY_MS, now)).toBe(5);
  });
});

describe('completionStats', () => {
  it('returns null avg for single completion', () => {
    const task = t({ history: [now] });
    expect(completionStats(task)).toEqual({ count: 1, avgDays: null });
  });

  it('averages the gaps between completions', () => {
    const task = t({
      history: [now - 20 * DAY_MS, now - 15 * DAY_MS, now - 10 * DAY_MS, now - 5 * DAY_MS],
    });
    const s = completionStats(task);
    expect(s.count).toBe(4);
    expect(s.avgDays).toBe(5);
  });
});

describe('listSummary', () => {
  it('says everything is resting when only resting tasks exist', () => {
    expect(
      listSummary({ unstarted: [], needsAttention: [], resting: [{}], snoozed: [] })
    ).toMatch(/resting/);
  });

  it('says no tasks yet when truly empty', () => {
    expect(
      listSummary({ unstarted: [], needsAttention: [], resting: [], snoozed: [] })
    ).toMatch(/No tasks/);
  });

  it('counts attention items', () => {
    expect(
      listSummary({ unstarted: [], needsAttention: [{}, {}, {}], resting: [], snoozed: [] })
    ).toMatch(/3 things/);
  });

  it('uses singular for one', () => {
    expect(
      listSummary({ unstarted: [], needsAttention: [{}], resting: [], snoozed: [] })
    ).toMatch(/1 thing/);
  });

  it('mentions snoozed when relevant', () => {
    expect(
      listSummary({ unstarted: [], needsAttention: [{}], resting: [], snoozed: [{}] })
    ).toMatch(/snoozed/);
  });

  it('mentions unstarted when relevant', () => {
    expect(
      listSummary({ unstarted: [{}, {}], needsAttention: [], resting: [], snoozed: [] })
    ).toMatch(/2 not started/);
  });
});

describe('normalizeTask notes', () => {
  it('defaults notes to empty string', () => {
    expect(normalizeTask({ name: 'x' }).notes).toBe('');
  });

  it('preserves string notes', () => {
    expect(normalizeTask({ name: 'x', notes: 'in the cupboard' }).notes).toBe('in the cupboard');
  });

  it('ignores non-string notes', () => {
    expect(normalizeTask({ name: 'x', notes: 123 }).notes).toBe('');
  });
});
