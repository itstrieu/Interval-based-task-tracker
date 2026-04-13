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
  it('splits into needsAttention / resting / snoozed', () => {
    const fresh = t({ id: 'f', history: [now] });
    const approaching = t({ id: 'a', history: [now - 11 * DAY_MS] });
    const due = t({ id: 'd', history: [now - 20 * DAY_MS] });
    const snoozed = t({ id: 's', history: [now - 20 * DAY_MS], snoozedUntil: now + DAY_MS });
    const { needsAttention, resting, snoozed: snz } = groupTasks(
      [fresh, approaching, due, snoozed],
      now
    );
    expect(needsAttention.map((x) => x.task.id)).toEqual(['d', 'a']);
    expect(resting.map((x) => x.task.id)).toEqual(['f']);
    expect(snz.map((x) => x.task.id)).toEqual(['s']);
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

  it('daysSince floors to whole days', () => {
    expect(daysSince(now - DAY_MS - 5000, now)).toBe(1);
  });
});
