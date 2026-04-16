import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DAY_MS,
  makeId,
  normalizeTask,
  lastDoneOf,
  isSnoozed,
  groupTasks,
  metaText,
  shortDate,
  reorderTasks,
  seedTasks,
  completionStats,
  listSummary,
} from './logic.js';
import { useGestures } from './useGestures.js';

const STORAGE_KEY = 'interval-tracker-v1';
const THEME_KEY = 'interval-tracker-theme';
const HINT_KEY = 'interval-tracker-hint-dismissed';
const UNDO_WINDOW_MS = 6000;

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedTasks();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return seedTasks();
    return parsed.map((t, i) => normalizeTask(t, i));
  } catch {
    return seedTasks();
  }
}

function saveTasks(tasks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    /* ignore */
  }
}

function loadTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || 'auto';
  } catch {
    return 'auto';
  }
}

function loadHintDismissed() {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
}

function prettyDate(d) {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export default function App() {
  const [tasks, setTasks] = useState(loadTasks);
  const [now, setNow] = useState(() => Date.now());
  const [modal, setModal] = useState(null);
  const [undo, setUndo] = useState(null);
  const [theme, setTheme] = useState(loadTheme);
  const [hintDismissed, setHintDismissed] = useState(loadHintDismissed);
  const [snoozedCollapsed, setSnoozedCollapsed] = useState(true);
  const [celebration, setCelebration] = useState(null);
  const [justDue, setJustDue] = useState(null);
  const undoTimerRef = useRef(null);
  const justDueTimerRef = useRef(null);
  const celebrationTimerRef = useRef(null);
  const prevAttentionIdsRef = useRef(null);

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
    const root = document.documentElement;
    if (theme === 'auto') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }, [theme]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const grouped = useMemo(() => groupTasks(tasks, now), [tasks, now]);

  // Detect transitions into and out of the attention set.
  useEffect(() => {
    const currentIds = new Set(grouped.needsAttention.map((x) => x.task.id));
    const prev = prevAttentionIdsRef.current;
    if (prev !== null) {
      const newly = [...currentIds].filter((id) => !prev.has(id));
      if (newly.length > 0) {
        const names = newly
          .map((id) => tasks.find((t) => t.id === id)?.name)
          .filter(Boolean);
        setJustDue({ names, at: Date.now() });
        if (justDueTimerRef.current) clearTimeout(justDueTimerRef.current);
        justDueTimerRef.current = setTimeout(() => setJustDue(null), 8000);
      }
      // Celebration: count dropped from >0 to 0
      if (prev.size > 0 && currentIds.size === 0 && tasks.length > 0) {
        setCelebration(Date.now());
        if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
        celebrationTimerRef.current = setTimeout(() => setCelebration(null), 3500);
      }
    }
    prevAttentionIdsRef.current = currentIds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped]);

  function markDoneAt(id, timestamp) {
    const prevTask = tasks.find((t) => t.id === id);
    if (!prevTask) return;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              history: [...t.history, timestamp].sort((a, b) => a - b),
              snoozedUntil: null,
            }
          : t
      )
    );
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndo({ task: prevTask, at: Date.now() });
    undoTimerRef.current = setTimeout(() => setUndo(null), UNDO_WINDOW_MS);
  }

  function markDone(id) {
    markDoneAt(id, Date.now());
  }

  function doUndo() {
    if (!undo) return;
    const snap = undo.task;
    setTasks((prev) => prev.map((t) => (t.id === snap.id ? snap : t)));
    setUndo(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }

  function addTask({ name, intervalMin, intervalMax, notes, lastDoneAt }) {
    // lastDoneAt: null means "not started yet"; otherwise a timestamp.
    const history = lastDoneAt ? [lastDoneAt] : [];
    setTasks((prev) => [
      ...prev,
      normalizeTask({
        id: makeId(),
        name,
        intervalMin,
        intervalMax,
        notes,
        history,
        order: prev.length,
      }),
    ]);
  }

  function quickAdd(name) {
    const trimmed = name.trim();
    if (!trimmed) return false;
    // Quick-add leaves the task unstarted — user taps to record first completion.
    addTask({ name: trimmed, intervalMin: 7, intervalMax: 10, notes: '', lastDoneAt: null });
    return true;
  }

  function removeHistoryEntry(id, timestamp) {
    const prevTask = tasks.find((t) => t.id === id);
    if (!prevTask) return;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, history: t.history.filter((ts) => ts !== timestamp) }
          : t
      )
    );
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndo({ task: prevTask, at: Date.now(), kind: 'remove' });
    undoTimerRef.current = setTimeout(() => setUndo(null), UNDO_WINDOW_MS);
  }

  function updateTask(id, patch) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function deleteTask(id) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function moveTask(id, direction) {
    setTasks((prev) => reorderTasks(prev, id, direction));
  }

  function snoozeTask(id, days) {
    updateTask(id, { snoozedUntil: Date.now() + days * DAY_MS });
  }

  function wakeTask(id) {
    updateTask(id, { snoozedUntil: null });
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interval-tracker-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importData(text) {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error('Expected an array of tasks.');
    setTasks(parsed.map((t, i) => normalizeTask(t, i)));
  }

  function resetToDefaults() {
    setTasks(seedTasks());
  }

  function dismissHint() {
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      /* ignore */
    }
    setHintDismissed(true);
  }

  const currentTask = modal?.task ? tasks.find((t) => t.id === modal.task.id) : null;
  const allResting =
    grouped.needsAttention.length === 0 &&
    grouped.unstarted.length === 0 &&
    grouped.resting.length > 0;
  const nothingAtAll =
    grouped.unstarted.length === 0 &&
    grouped.needsAttention.length === 0 &&
    grouped.resting.length === 0 &&
    grouped.snoozed.length === 0;

  return (
    <div className="app">
      <header className="header">
        <div className="header-text">
          <h1>Today</h1>
          <span className="date">{prettyDate(new Date(now))}</span>
          <span className="summary">{listSummary(grouped)}</span>
        </div>
        <button
          className="icon-button"
          onClick={() => setModal({ mode: 'settings' })}
          aria-label="Settings"
        >
          •••
        </button>
      </header>

      {!hintDismissed && tasks.length > 0 && (
        <div className="hint-card" role="note">
          <span>Tap to complete · swipe left to snooze · hold to edit.</span>
          <button onClick={dismissHint} aria-label="Dismiss hint">
            ✕
          </button>
        </div>
      )}

      <QuickAdd onAdd={quickAdd} />

      {nothingAtAll && <div className="empty">No tasks yet. Add one above.</div>}

      {grouped.unstarted.length > 0 && (
        <>
          <div className="section-label">Not started yet</div>
          <TaskList
            items={grouped.unstarted}
            now={now}
            onDone={markDone}
            onEdit={(task) => setModal({ mode: 'edit', task })}
            onSnooze={(id) => snoozeTask(id, 1)}
          />
        </>
      )}

      {grouped.needsAttention.length > 0 && (
        <>
          <div className="section-label">Wants attention</div>
          <TaskList
            items={grouped.needsAttention}
            now={now}
            onDone={markDone}
            onEdit={(task) => setModal({ mode: 'edit', task })}
            onSnooze={(id) => snoozeTask(id, 1)}
          />
        </>
      )}

      {allResting && (
        <div className="calm-state" aria-live="polite">
          <span className="calm-state-glyph" aria-hidden="true">·</span>
          <span>Nice — nothing's pressing right now.</span>
        </div>
      )}

      {grouped.resting.length > 0 && (
        <>
          <div className="section-label">Resting</div>
          <TaskList
            items={grouped.resting}
            now={now}
            onDone={markDone}
            onEdit={(task) => setModal({ mode: 'edit', task })}
            onSnooze={(id) => snoozeTask(id, 1)}
          />
        </>
      )}

      {grouped.snoozed.length > 0 && (
        <>
          <button
            className="section-label section-toggle"
            onClick={() => setSnoozedCollapsed((v) => !v)}
            aria-expanded={!snoozedCollapsed}
          >
            <span>Snoozed ({grouped.snoozed.length})</span>
            <span className="section-caret">{snoozedCollapsed ? '▸' : '▾'}</span>
          </button>
          {!snoozedCollapsed && (
            <TaskList
              items={grouped.snoozed}
              now={now}
              onDone={markDone}
              onEdit={(task) => setModal({ mode: 'edit', task })}
              onSnooze={(id) => snoozeTask(id, 1)}
            />
          )}
        </>
      )}

      {undo && (
        <div className="toast" role="status">
          <span>Marked “{undo.task.name}” done</span>
          <button className="toast-action" onClick={doUndo}>
            Undo
          </button>
        </div>
      )}

      {!undo && justDue && (
        <div className="toast toast-soft" role="status">
          <span>
            {justDue.names.length === 1
              ? `“${justDue.names[0]}” could use attention`
              : `${justDue.names.length} things now want attention`}
          </span>
          <button className="toast-action" onClick={() => setJustDue(null)}>
            OK
          </button>
        </div>
      )}

      {celebration && (
        <div className="celebration" key={celebration} aria-live="polite">
          <span className="celebration-glyph">·</span>
          <span>All tended to.</span>
        </div>
      )}

      {modal?.mode === 'add' && (
        <TaskModal
          mode="add"
          onClose={() => setModal(null)}
          onSave={(data) => {
            addTask(data);
            setModal(null);
          }}
        />
      )}

      {modal?.mode === 'edit' && currentTask && (
        <TaskModal
          mode="edit"
          task={currentTask}
          tasks={tasks}
          now={now}
          onClose={() => setModal(null)}
          onSave={(data) => {
            updateTask(currentTask.id, data);
            setModal(null);
          }}
          onDelete={() => {
            deleteTask(currentTask.id);
            setModal(null);
          }}
          onMoveUp={() => moveTask(currentTask.id, 'up')}
          onMoveDown={() => moveTask(currentTask.id, 'down')}
          onSnooze={(days) => snoozeTask(currentTask.id, days)}
          onWake={() => wakeTask(currentTask.id)}
          onMarkDoneDaysAgo={(daysAgo) =>
            markDoneAt(currentTask.id, Date.now() - daysAgo * DAY_MS)
          }
          onMarkDoneAt={(ts) => markDoneAt(currentTask.id, ts)}
          onRemoveHistoryEntry={(ts) => removeHistoryEntry(currentTask.id, ts)}
        />
      )}

      {modal?.mode === 'settings' && (
        <SettingsModal
          theme={theme}
          onClose={() => setModal(null)}
          onExport={exportData}
          onImport={importData}
          onReset={resetToDefaults}
          onThemeChange={setTheme}
          onOpenAdd={() => setModal({ mode: 'add' })}
        />
      )}
    </div>
  );
}

function QuickAdd({ onAdd }) {
  const [value, setValue] = useState('');
  function submit(e) {
    e.preventDefault();
    if (onAdd(value)) setValue('');
  }
  return (
    <form className="quick-add" onSubmit={submit}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add a task…  (uses a 7–10 day default; edit later for tighter cadence)"
        aria-label="Quick-add task"
      />
      {value.trim() && (
        <button type="submit" className="quick-add-submit" aria-label="Add task">
          ↵
        </button>
      )}
    </form>
  );
}

function TaskList({ items, now, onDone, onEdit, onSnooze }) {
  return (
    <div className="task-list">
      {items.map(({ task, state }) => (
        <TaskRow
          key={task.id}
          task={task}
          state={state}
          now={now}
          onDone={() => onDone(task.id)}
          onEdit={() => onEdit(task)}
          onSnooze={() => onSnooze(task.id)}
        />
      ))}
    </div>
  );
}

function TaskRow({ task, state, now, onDone, onEdit, onSnooze }) {
  const { dx, handlers } = useGestures({
    onTap: onDone,
    onSwipeLeft: onSnooze,
    onLongPress: onEdit,
  });

  const revealing = dx < -10;
  const committed = dx <= -80;

  return (
    <div className="task-row">
      <div className={`task-swipe-pane ${committed ? 'committed' : ''}`}>
        <span className="task-swipe-label">{committed ? 'Snooze 1 day' : 'Snooze…'}</span>
      </div>
      <div
        className={`task ${state} ${revealing ? 'revealing' : ''}`}
        style={{ transform: `translateX(${dx}px)`, transition: dx === 0 ? 'transform 0.22s ease' : 'none' }}
        role="button"
        tabIndex={0}
        aria-label={`${task.name}. Tap to mark done. Swipe left to snooze. Long press to edit.`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onDone();
          } else if (e.key === 'e') {
            e.preventDefault();
            onEdit();
          }
        }}
        {...handlers}
      >
        <span className="task-dot" aria-hidden="true" />
        <span className="task-body">
          <div className="task-name">{task.name}</div>
          <div className="task-meta">{metaText(task, now)}</div>
          {task.notes && <div className="task-notes">{task.notes}</div>}
        </span>
      </div>
    </div>
  );
}

function TaskModal({
  mode,
  task,
  tasks = [],
  now = Date.now(),
  onClose,
  onSave,
  onDelete,
  onMoveUp,
  onMoveDown,
  onSnooze,
  onWake,
  onMarkDoneDaysAgo,
  onMarkDoneAt,
  onRemoveHistoryEntry,
}) {
  const [name, setName] = useState(task?.name ?? '');
  const [min, setMin] = useState(task?.intervalMin ?? 7);
  const [max, setMax] = useState(task?.intervalMax ?? 10);
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Add-mode: "when was the last time?"
  const [addLastDone, setAddLastDone] = useState('unstarted');
  // Edit-mode: ad-hoc "record a completion on date" picker
  const [customDate, setCustomDate] = useState('');
  const [addCustomDate, setAddCustomDate] = useState('');
  const [historyConfirm, setHistoryConfirm] = useState(null); // timestamp pending removal

  const taskIndex = task ? tasks.findIndex((t) => t.id === task.id) : -1;
  const canMoveUp = taskIndex > 0;
  const canMoveDown = taskIndex >= 0 && taskIndex < tasks.length - 1;
  const snoozed = task && isSnoozed(task, now);

  function resolveLastDone() {
    switch (addLastDone) {
      case 'unstarted':
        return null;
      case 'today':
        return Date.now();
      case 'yesterday':
        return Date.now() - DAY_MS;
      case '3days':
        return Date.now() - 3 * DAY_MS;
      case 'week':
        return Date.now() - 7 * DAY_MS;
      case 'custom':
        if (!addCustomDate) return null;
        return new Date(addCustomDate + 'T12:00:00').getTime();
      default:
        return null;
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('Give it a name.');
    const minN = Number(min);
    const maxN = Number(max);
    if (!Number.isFinite(minN) || minN < 1) return setError('Min must be 1 or more.');
    if (!Number.isFinite(maxN) || maxN < minN) return setError('Max must be ≥ min.');
    const payload = {
      name: trimmed,
      intervalMin: minN,
      intervalMax: maxN,
      notes: notes.trim(),
    };
    if (mode === 'add') payload.lastDoneAt = resolveLastDone();
    onSave(payload);
  }

  function handleCustomMarkDone() {
    if (!customDate) return;
    const ts = new Date(customDate + 'T12:00:00').getTime();
    if (!Number.isFinite(ts)) return;
    onMarkDoneAt(ts);
    setCustomDate('');
  }

  const recent = task ? [...task.history].slice(-10).reverse() : [];
  const stats = task ? completionStats(task) : null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{mode === 'add' ? 'New task' : 'Edit task'}</h2>

        <div className="field">
          <label>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Water plants"
            autoFocus
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label>Min days</label>
            <input
              type="number"
              min="1"
              value={min}
              onChange={(e) => setMin(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Max days</label>
            <input
              type="number"
              min="1"
              value={max}
              onChange={(e) => setMax(e.target.value)}
            />
          </div>
        </div>
        <div className="hint">Soft cadence — e.g. every 5–7 days.</div>

        <div className="field" style={{ marginTop: 16 }}>
          <label>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything that helps — supplies, which cupboard, etc."
            rows={2}
          />
        </div>

        {mode === 'add' && (
          <>
            <div className="subsection-label" style={{ marginTop: 4 }}>
              When did you last do this?
            </div>
            <div className="chip-row">
              {[
                ['unstarted', 'Not sure / just tracking'],
                ['today', 'Today'],
                ['yesterday', 'Yesterday'],
                ['3days', '3 days ago'],
                ['week', 'A week ago'],
                ['custom', 'Pick a date'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`chip ${addLastDone === value ? 'chip-active' : ''}`}
                  onClick={() => setAddLastDone(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {addLastDone === 'custom' && (
              <input
                type="date"
                value={addCustomDate}
                onChange={(e) => setAddCustomDate(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="date-input"
                style={{ marginTop: 10 }}
              />
            )}
            <div className="hint">
              {addLastDone === 'unstarted'
                ? 'The task will sit in "Not started yet" until you tap it the first time.'
                : 'Sets the starting point so the clock reflects when you actually did it.'}
            </div>
          </>
        )}

        {error && <div className="hint" style={{ color: 'var(--danger)' }}>{error}</div>}

        <div className="modal-actions" style={{ marginTop: 18 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Save
          </button>
        </div>

        {mode === 'edit' && (
          <>
            <div className="divider" />

            <div className="subsection-label">Record a completion</div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onMarkDoneDaysAgo(0)}
              >
                Today
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onMarkDoneDaysAgo(1)}
              >
                Yesterday
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onMarkDoneDaysAgo(2)}
              >
                2d ago
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onMarkDoneDaysAgo(3)}
              >
                3d ago
              </button>
            </div>
            <div className="date-row" style={{ marginTop: 10 }}>
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="date-input"
                aria-label="Specific date"
              />
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!customDate}
                onClick={handleCustomMarkDone}
              >
                Record
              </button>
            </div>

            <div className="subsection-label" style={{ marginTop: 18 }}>
              History
            </div>
            {stats && stats.avgDays != null && (
              <div className="hint" style={{ marginBottom: 8 }}>
                {stats.count} completions · roughly every {stats.avgDays} day
                {stats.avgDays === 1 ? '' : 's'}
              </div>
            )}
            {stats && stats.avgDays == null && stats.count === 1 && (
              <div className="hint" style={{ marginBottom: 8 }}>
                1 completion so far
              </div>
            )}
            {recent.length === 0 ? (
              <div className="hint">Not started yet — tap the row, or record a date above.</div>
            ) : (
              <div className="history-list">
                {recent.map((ts) => {
                  const pending = historyConfirm === ts;
                  return pending ? (
                    <button
                      type="button"
                      key={ts + '-confirm'}
                      className="history-chip history-chip--remove"
                      onClick={() => {
                        onRemoveHistoryEntry(ts);
                        setHistoryConfirm(null);
                      }}
                      onBlur={() => setHistoryConfirm(null)}
                      autoFocus
                    >
                      Remove?
                    </button>
                  ) : (
                    <button
                      type="button"
                      key={ts}
                      className="history-chip history-chip--button"
                      onClick={() => setHistoryConfirm(ts)}
                      title="Tap to remove this entry"
                    >
                      {shortDate(ts)}
                    </button>
                  );
                })}
                {task.history.length > recent.length && (
                  <span className="history-more">+{task.history.length - recent.length} more</span>
                )}
              </div>
            )}

            <div className="divider" />

            <div className="subsection-label">Order</div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!canMoveUp}
                onClick={onMoveUp}
              >
                ↑ Move up
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!canMoveDown}
                onClick={onMoveDown}
              >
                ↓ Move down
              </button>
            </div>

            <div className="subsection-label" style={{ marginTop: 14 }}>
              Snooze
            </div>
            {snoozed ? (
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={onWake}>
                  Wake now (snoozed until {shortDate(task.snoozedUntil)})
                </button>
              </div>
            ) : (
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onSnooze(1)}
                >
                  1 day
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onSnooze(3)}
                >
                  3 days
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onSnooze(7)}
                >
                  1 week
                </button>
              </div>
            )}

            <div className="divider" />

            {confirmDelete ? (
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep
                </button>
                <button type="button" className="btn btn-danger" onClick={onDelete}>
                  Delete “{task.name}”
                </button>
              </div>
            ) : (
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete task
                </button>
              </div>
            )}
          </>
        )}
      </form>
    </div>
  );
}

function SettingsModal({
  theme,
  onClose,
  onExport,
  onImport,
  onReset,
  onThemeChange,
}) {
  const [importError, setImportError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef(null);

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        onImport(String(reader.result));
        setImportError('');
        onClose();
      } catch (err) {
        setImportError(err.message || 'Could not read that file.');
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <div className="subsection-label">Theme</div>
        <div className="theme-picker">
          {['auto', 'light', 'dark'].map((t) => (
            <button
              key={t}
              type="button"
              className={`theme-option ${theme === t ? 'active' : ''}`}
              onClick={() => onThemeChange(t)}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="divider" />

        <div className="subsection-label">Backup</div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onExport}>
            Export JSON
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fileRef.current?.click()}
          >
            Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            style={{ display: 'none' }}
          />
        </div>
        <div className="hint">Import replaces all current tasks.</div>
        {importError && (
          <div className="hint" style={{ color: 'var(--danger)' }}>
            {importError}
          </div>
        )}

        <div className="divider" />

        <div className="subsection-label">Reset</div>
        {confirmReset ? (
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setConfirmReset(false)}
            >
              Keep my tasks
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                onReset();
                setConfirmReset(false);
                onClose();
              }}
            >
              Reset to defaults
            </button>
          </div>
        ) : (
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setConfirmReset(true)}
            >
              Reset to starter tasks
            </button>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 18 }}>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
