import { useEffect, useMemo, useRef, useState } from 'react';

const DAY_MS = 1000 * 60 * 60 * 24;
const STORAGE_KEY = 'interval-tracker-v1';
const UNDO_WINDOW_MS = 6000;

const STARTER_TASKS = [
  { name: 'Laundry', intervalMin: 10, intervalMax: 14 },
  { name: 'Vacuum', intervalMin: 1, intervalMax: 2 },
  { name: 'Groceries', intervalMin: 5, intervalMax: 7 },
  { name: 'Batch cook & freeze meals', intervalMin: 10, intervalMax: 14 },
  { name: 'Clean litter robot', intervalMin: 3, intervalMax: 5 },
  { name: 'Take out trash', intervalMin: 5, intervalMax: 7 },
  { name: 'Wipe down surfaces', intervalMin: 5, intervalMax: 7 },
  { name: 'Water plants', intervalMin: 5, intervalMax: 7 },
];

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function normalizeTask(t, i = 0) {
  return {
    id: t.id ?? makeId(),
    name: t.name ?? 'Untitled',
    intervalMin: Number(t.intervalMin) || 1,
    intervalMax: Number(t.intervalMax) || Number(t.intervalMin) || 1,
    lastDone: Number(t.lastDone) || Date.now(),
    order: Number.isFinite(t.order) ? t.order : i,
    snoozedUntil: Number.isFinite(t.snoozedUntil) ? t.snoozedUntil : null,
  };
}

function seedTasks() {
  const now = Date.now();
  return STARTER_TASKS.map((t, i) =>
    normalizeTask({ id: makeId(), ...t, lastDone: now, order: i })
  );
}

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

function daysSince(lastDone, now) {
  return Math.floor((now - lastDone) / DAY_MS);
}

function isSnoozed(task, now) {
  return task.snoozedUntil && task.snoozedUntil > now;
}

function stateFor(task, now) {
  if (isSnoozed(task, now)) return 'snoozed';
  const d = daysSince(task.lastDone, now);
  if (d >= task.intervalMax) return 'due';
  if (d >= task.intervalMin) return 'approaching';
  return 'fresh';
}

function rangeText(task) {
  if (task.intervalMin === task.intervalMax) return `${task.intervalMin}d`;
  return `${task.intervalMin}–${task.intervalMax}d`;
}

function shortDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function metaText(task, now) {
  if (isSnoozed(task, now)) {
    return `snoozed until ${shortDate(task.snoozedUntil)} · every ${rangeText(task)}`;
  }
  const d = daysSince(task.lastDone, now);
  const date = shortDate(task.lastDone);
  if (d === 0) return `done today · every ${rangeText(task)}`;
  if (d === 1) return `1 day ago · ${date} · every ${rangeText(task)}`;
  return `${d} days ago · ${date} · every ${rangeText(task)}`;
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
  const [modal, setModal] = useState(null); // null | { mode: 'add' } | { mode: 'edit', task } | { mode: 'settings' }
  const [undo, setUndo] = useState(null); // null | { task: <snapshot>, at: number }
  const undoTimerRef = useRef(null);

  // Persist
  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  // Refresh "now" each minute so visual states update without reload
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const grouped = useMemo(() => {
    const withState = tasks.map((t) => ({ task: t, state: stateFor(t, now) }));
    const stateOrder = { due: 0, approaching: 1, fresh: 2, snoozed: 3 };
    withState.sort((a, b) => {
      if (stateOrder[a.state] !== stateOrder[b.state]) {
        return stateOrder[a.state] - stateOrder[b.state];
      }
      // Within same state: user-defined order, then by recency
      if (a.task.order !== b.task.order) return a.task.order - b.task.order;
      return daysSince(b.task.lastDone, now) - daysSince(a.task.lastDone, now);
    });
    return {
      needsAttention: withState.filter((x) => x.state === 'due' || x.state === 'approaching'),
      resting: withState.filter((x) => x.state === 'fresh'),
      snoozed: withState.filter((x) => x.state === 'snoozed'),
    };
  }, [tasks, now]);

  function markDone(id) {
    const prevTask = tasks.find((t) => t.id === id);
    if (!prevTask) return;
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, lastDone: Date.now(), snoozedUntil: null } : t))
    );
    // Stage undo
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndo({ task: prevTask, at: Date.now() });
    undoTimerRef.current = setTimeout(() => setUndo(null), UNDO_WINDOW_MS);
  }

  function doUndo() {
    if (!undo) return;
    const snap = undo.task;
    setTasks((prev) => prev.map((t) => (t.id === snap.id ? snap : t)));
    setUndo(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }

  function addTask({ name, intervalMin, intervalMax }) {
    setTasks((prev) => [
      ...prev,
      normalizeTask({
        id: makeId(),
        name,
        intervalMin,
        intervalMax,
        lastDone: Date.now(),
        order: prev.length,
      }),
    ]);
  }

  function updateTask(id, patch) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function deleteTask(id) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function moveTask(id, direction) {
    setTasks((prev) => {
      const ids = prev.map((t) => t.id);
      const i = ids.indexOf(id);
      if (i === -1) return prev;
      const j = direction === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      // Re-index order
      return copy.map((t, k) => ({ ...t, order: k }));
    });
  }

  function snoozeTask(id, days) {
    const until = Date.now() + days * DAY_MS;
    updateTask(id, { snoozedUntil: until });
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
    const normalized = parsed.map((t, i) => normalizeTask(t, i));
    setTasks(normalized);
  }

  const currentTask = modal?.task ? tasks.find((t) => t.id === modal.task.id) : null;

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Today</h1>
          <span className="date">{prettyDate(new Date(now))}</span>
        </div>
        <button
          className="icon-button"
          onClick={() => setModal({ mode: 'settings' })}
          aria-label="Settings"
        >
          •••
        </button>
      </header>

      {grouped.needsAttention.length === 0 &&
        grouped.resting.length === 0 &&
        grouped.snoozed.length === 0 && (
          <div className="empty">No tasks yet. Add one below.</div>
        )}

      {grouped.needsAttention.length > 0 && (
        <>
          <div className="section-label">Wants attention</div>
          <TaskList
            items={grouped.needsAttention}
            now={now}
            onDone={markDone}
            onEdit={(task) => setModal({ mode: 'edit', task })}
          />
        </>
      )}

      {grouped.resting.length > 0 && (
        <>
          <div className="section-label">Resting</div>
          <TaskList
            items={grouped.resting}
            now={now}
            onDone={markDone}
            onEdit={(task) => setModal({ mode: 'edit', task })}
          />
        </>
      )}

      {grouped.snoozed.length > 0 && (
        <>
          <div className="section-label">Snoozed</div>
          <TaskList
            items={grouped.snoozed}
            now={now}
            onDone={markDone}
            onEdit={(task) => setModal({ mode: 'edit', task })}
          />
        </>
      )}

      <button className="add-button" onClick={() => setModal({ mode: 'add' })}>
        + Add task
      </button>

      {undo && (
        <div className="toast" role="status">
          <span>Marked “{undo.task.name}” done</span>
          <button className="toast-action" onClick={doUndo}>
            Undo
          </button>
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
          now={now}
        />
      )}

      {modal?.mode === 'settings' && (
        <SettingsModal
          onClose={() => setModal(null)}
          onExport={exportData}
          onImport={importData}
        />
      )}
    </div>
  );
}

function TaskList({ items, now, onDone, onEdit }) {
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
        />
      ))}
    </div>
  );
}

function TaskRow({ task, state, now, onDone, onEdit }) {
  return (
    <button className={`task ${state}`} onClick={onDone} aria-label={`Mark ${task.name} done`}>
      <span className="task-dot" aria-hidden="true" />
      <span className="task-body">
        <div className="task-name">{task.name}</div>
        <div className="task-meta">{metaText(task, now)}</div>
      </span>
      <span
        className="task-edit"
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onEdit();
          }
        }}
        aria-label={`Edit ${task.name}`}
      >
        edit
      </span>
    </button>
  );
}

function TaskModal({
  mode,
  task,
  tasks = [],
  onClose,
  onSave,
  onDelete,
  onMoveUp,
  onMoveDown,
  onSnooze,
  onWake,
  now,
}) {
  const [name, setName] = useState(task?.name ?? '');
  const [min, setMin] = useState(task?.intervalMin ?? 7);
  const [max, setMax] = useState(task?.intervalMax ?? 10);
  const [error, setError] = useState('');

  const taskIndex = task ? tasks.findIndex((t) => t.id === task.id) : -1;
  const canMoveUp = taskIndex > 0;
  const canMoveDown = taskIndex >= 0 && taskIndex < tasks.length - 1;
  const snoozed = task && isSnoozed(task, now ?? Date.now());

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('Give it a name.');
    const minN = Number(min);
    const maxN = Number(max);
    if (!Number.isFinite(minN) || minN < 1) return setError('Min must be 1 or more.');
    if (!Number.isFinite(maxN) || maxN < minN) return setError('Max must be ≥ min.');
    onSave({ name: trimmed, intervalMin: minN, intervalMax: maxN });
  }

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

        {error && <div className="hint" style={{ color: '#a85a4a' }}>{error}</div>}

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

            <div className="subsection-label">Snooze</div>
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

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  if (confirm(`Delete "${task.name}"?`)) onDelete();
                }}
              >
                Delete task
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function SettingsModal({ onClose, onExport, onImport }) {
  const [importError, setImportError] = useState('');
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
        <div className="hint">
          Export downloads a JSON file of every task. Import replaces all current tasks.
        </div>
        {importError && (
          <div className="hint" style={{ color: '#a85a4a' }}>
            {importError}
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
