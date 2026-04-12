import { useEffect, useMemo, useState } from 'react';

const DAY_MS = 1000 * 60 * 60 * 24;
const STORAGE_KEY = 'interval-tracker-v1';

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

function seedTasks() {
  const now = Date.now();
  return STARTER_TASKS.map((t) => ({
    id: makeId(),
    ...t,
    // Stagger initial lastDone so the demo shows variety of states
    lastDone: now,
  }));
}

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedTasks();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return seedTasks();
    return parsed;
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

function stateFor(task, now) {
  const d = daysSince(task.lastDone, now);
  if (d >= task.intervalMax) return 'due';
  if (d >= task.intervalMin) return 'approaching';
  return 'fresh';
}

function metaText(task, now) {
  const d = daysSince(task.lastDone, now);
  if (d === 0) return 'done today · every ' + rangeText(task);
  if (d === 1) return '1 day ago · every ' + rangeText(task);
  return `${d} days ago · every ${rangeText(task)}`;
}

function rangeText(task) {
  if (task.intervalMin === task.intervalMax) return `${task.intervalMin}d`;
  return `${task.intervalMin}–${task.intervalMax}d`;
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
  const [modal, setModal] = useState(null); // null | { mode: 'add' } | { mode: 'edit', task }

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
    const order = { due: 0, approaching: 1, fresh: 2 };
    withState.sort((a, b) => {
      if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
      return daysSince(b.task.lastDone, now) - daysSince(a.task.lastDone, now);
    });
    return {
      needsAttention: withState.filter((x) => x.state !== 'fresh'),
      resting: withState.filter((x) => x.state === 'fresh'),
    };
  }, [tasks, now]);

  function markDone(id) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, lastDone: Date.now() } : t)));
  }

  function addTask({ name, intervalMin, intervalMax }) {
    setTasks((prev) => [
      ...prev,
      {
        id: makeId(),
        name,
        intervalMin,
        intervalMax,
        lastDone: Date.now(),
      },
    ]);
  }

  function updateTask(id, patch) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function deleteTask(id) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Today</h1>
        <span className="date">{prettyDate(new Date(now))}</span>
      </header>

      {grouped.needsAttention.length === 0 && grouped.resting.length === 0 && (
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

      <button className="add-button" onClick={() => setModal({ mode: 'add' })}>
        + Add task
      </button>

      {modal && (
        <TaskModal
          mode={modal.mode}
          task={modal.task}
          onClose={() => setModal(null)}
          onSave={(data) => {
            if (modal.mode === 'add') addTask(data);
            else updateTask(modal.task.id, data);
            setModal(null);
          }}
          onDelete={() => {
            deleteTask(modal.task.id);
            setModal(null);
          }}
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

function TaskModal({ mode, task, onClose, onSave, onDelete }) {
  const [name, setName] = useState(task?.name ?? '');
  const [min, setMin] = useState(task?.intervalMin ?? 7);
  const [max, setMax] = useState(task?.intervalMax ?? 10);
  const [error, setError] = useState('');

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
          <div className="modal-actions" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                if (confirm(`Delete "${task.name}"?`)) onDelete();
              }}
            >
              Delete
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
