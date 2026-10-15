
import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const STORAGE_KEY = "personal-todo-tasks";
const REMINDER_KEY = "personal-todo-reminders-sent";

const CATEGORIES = ["Work", "Personal", "Study", "Health", "Other"];
const PRIORITIES = ["Low", "Medium", "High"];

const EMPTY_FORM = {
  title: "",
  description: "",
  category: "Personal",
  priority: "Medium",
  dueAt: "",
  reminderAt: "",
};

function createId() {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function formatDate(value, options = {}) {
  if (!value) return "No date set";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    ...options,
  }).format(date);
}

function isOverdue(task) {
  return Boolean(
    task.dueAt &&
    !task.completed &&
    new Date(task.dueAt).getTime() < Date.now()
  );
}

function isDueToday(task) {
  if (!task.dueAt) return false;

  const due = new Date(task.dueAt);
  const now = new Date();

  return (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
  );
}

function getDueLabel(task) {
  if (!task.dueAt) return "No deadline";
  if (task.completed) return `Due ${formatDate(task.dueAt)}`;
  if (isOverdue(task)) return `Overdue · ${formatDate(task.dueAt)}`;
  if (isDueToday(task)) return "Due today";

  return `Due ${formatDate(task.dueAt, {
    year: new Date(task.dueAt).getFullYear() !== new Date().getFullYear()
      ? "numeric"
      : undefined,
  })}`;
}

function App() {
  const [tasks, setTasks] = useState(loadTasks);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [sortBy, setSortBy] = useState("newest");
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => "Notification" in window && Notification.permission === "granted"
  );
  const [toast, setToast] = useState("");
  const reminderTimer = useRef(null);
  const sentReminders = useRef(new Set());

  const now = new Date();
  const todayText = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      setToast("Could not save tasks. Check your browser storage.");
    }
  }, [tasks]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(REMINDER_KEY) || "[]");
      sentReminders.current = new Set(Array.isArray(saved) ? saved : []);
    } catch {
      sentReminders.current = new Set();
    }
  }, []);

  useEffect(() => {
    if (!notificationsEnabled || !("Notification" in window)) return;

    const checkReminders = () => {
      const currentTime = Date.now();

      tasks.forEach((task) => {
        if (
          task.completed ||
          !task.reminderAt ||
          new Date(task.reminderAt).getTime() > currentTime ||
          sentReminders.current.has(task.id)
        ) {
          return;
        }

        try {
          new Notification("Little Steps reminder", {
            body: task.title,
            tag: `task-${task.id}`,
          });

          sentReminders.current.add(task.id);
          localStorage.setItem(
            REMINDER_KEY,
            JSON.stringify([...sentReminders.current])
          );
        } catch {
          // Notifications can be blocked by browser settings.
        }
      });
    };

    checkReminders();
    reminderTimer.current = window.setInterval(checkReminders, 15000);

    return () => window.clearInterval(reminderTimer.current);
  }, [tasks, notificationsEnabled]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((task) => task.completed).length;
    const pending = total - completed;
    const overdue = tasks.filter(isOverdue).length;
    const dueToday = tasks.filter(
      (task) => isDueToday(task) && !task.completed
    ).length;
    const completion = total ? Math.round((completed / total) * 100) : 0;

    return { total, completed, pending, overdue, dueToday, completion };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();

    const result = tasks.filter((task) => {
      const matchesSearch =
        !query ||
        task.title.toLowerCase().includes(query) ||
        (task.description || "").toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "All" ||
        (statusFilter === "Completed" && task.completed) ||
        (statusFilter === "Pending" && !task.completed) ||
        (statusFilter === "Overdue" && isOverdue(task));

      const matchesCategory =
        categoryFilter === "All" || task.category === categoryFilter;

      const matchesPriority =
        priorityFilter === "All" || task.priority === priorityFilter;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesCategory &&
        matchesPriority
      );
    });

    return result.sort((a, b) => {
      if (sortBy === "oldest") {
        return new Date(a.createdAt) - new Date(b.createdAt);
      }

      if (sortBy === "dueDate") {
        const dateA = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
        const dateB = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
        return dateA - dateB;
      }

      if (sortBy === "priority") {
        const order = { High: 0, Medium: 1, Low: 2 };
        return order[a.priority] - order[b.priority];
      }

      if (sortBy === "title") {
        return a.title.localeCompare(b.title);
      }

      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [tasks, search, statusFilter, categoryFilter, priorityFilter, sortBy]);

  function updateForm(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function handleSubmit(event) {
    event.preventDefault();

    const title = form.title.trim();
    if (!title) {
      setToast("Please enter a task title.");
      return;
    }

    if (form.dueAt && form.reminderAt) {
      if (new Date(form.reminderAt) > new Date(form.dueAt)) {
        setToast("Your reminder should be before the due date.");
        return;
      }
    }

    if (editingId) {
      setTasks((current) =>
        current.map((task) =>
          task.id === editingId
            ? {
                ...task,
                ...form,
                title,
                updatedAt: new Date().toISOString(),
              }
            : task
        )
      );
      setToast("Your task has been updated.");
    } else {
      const newTask = {
        id: createId(),
        ...form,
        title,
        completed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setTasks((current) => [newTask, ...current]);
      setToast("A little step added successfully.");
    }

    resetForm();
  }

  function editTask(task) {
    setForm({
      title: task.title,
      description: task.description || "",
      category: task.category || "Personal",
      priority: task.priority || "Medium",
      dueAt: task.dueAt || "",
      reminderAt: task.reminderAt || "",
    });
    setEditingId(task.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleTask(id) {
    setTasks((current) =>
      current.map((task) =>
        task.id === id
          ? {
              ...task,
              completed: !task.completed,
              updatedAt: new Date().toISOString(),
            }
          : task
      )
    );

    const task = tasks.find((item) => item.id === id);
    setToast(task?.completed ? "Task moved back to pending." : "Task completed. Well done!");
  }

  function deleteTask(id) {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;

    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) {
      return;
    }

    setTasks((current) => current.filter((item) => item.id !== id));
    sentReminders.current.delete(id);
    localStorage.setItem(
      REMINDER_KEY,
      JSON.stringify([...sentReminders.current])
    );

    if (editingId === id) resetForm();
    setToast("Task deleted.");
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setToast("This browser does not support notifications.");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      const enabled = permission === "granted";
      setNotificationsEnabled(enabled);
      setToast(
        enabled
          ? "Reminders are enabled."
          : "Please allow notifications in your browser settings."
      );
    } catch {
      setToast("Unable to enable notifications.");
    }
  }

  function clearCompleted() {
    const completedCount = tasks.filter((task) => task.completed).length;

    if (!completedCount) {
      setToast("There are no completed tasks to clear.");
      return;
    }

    if (!window.confirm(`Remove all ${completedCount} completed tasks?`)) {
      return;
    }

    setTasks((current) => current.filter((task) => !task.completed));
    setToast("Completed tasks cleared.");
  }

  const hasActiveFilters =
    search ||
    statusFilter !== "All" ||
    categoryFilter !== "All" ||
    priorityFilter !== "All";

  function clearFilters() {
    setSearch("");
    setStatusFilter("All");
    setCategoryFilter("All");
    setPriorityFilter("All");
    setSortBy("newest");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Little Steps home">
          <span className="brand-mark">ls.</span>
          <span className="brand-name">little<span>steps</span></span>
        </a>

        <div className="topbar-right">
          <span className="today-label">{todayText}</span>
          <button
            className={`notification-button ${notificationsEnabled ? "is-enabled" : ""}`}
            type="button"
            onClick={enableNotifications}
            title="Enable browser reminders"
          >
            <span aria-hidden="true">♧</span>
            <span>{notificationsEnabled ? "Reminders on" : "Enable reminders"}</span>
          </button>
        </div>
      </header>

      <main className="main-content">
        <section className="welcome-section">
          <div className="welcome-copy">
            <p className="eyebrow"><span className="eyebrow-dot" /> YOUR PERSONAL SPACE</p>
            <h1>
              Make room for
              <br />
              <span>what matters.</span>
            </h1>
            <p className="welcome-description">
              A calmer way to plan your day, stay focused, and celebrate every
              little step forward.
            </p>
            <div className="welcome-note">
              <span className="note-star">✳</span>
              <span>Progress over perfection. Always.</span>
            </div>
          </div>

          <div className="welcome-art" aria-hidden="true">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-sun">✳</div>
            <div className="art-card art-card-back" />
            <div className="art-card art-card-front">
              <span className="art-check">✓</span>
              <div className="art-lines">
                <i />
                <i />
                <i />
              </div>
              <span className="art-caption">one step at a time</span>
            </div>
            <span className="art-spark spark-one">✦</span>
            <span className="art-spark spark-two">✧</span>
            <span className="art-leaf">⌁</span>
          </div>
        </section>

        <section className="stats-grid" aria-label="Task overview">
          <article className="stat-card stat-total">
            <div className="stat-heading">
              <span className="stat-icon icon-total">▤</span>
              <span className="stat-caption">YOUR WORKLOAD</span>
            </div>
            <p className="stat-value">{stats.total}</p>
            <p className="stat-label">Total tasks</p>
            <div className="stat-bottom">
              <span>Everything in one place</span>
              <span className="stat-mini-mark">↗</span>
            </div>
          </article>

          <article className="stat-card stat-completed">
            <div className="stat-heading">
              <span className="stat-icon icon-completed">✓</span>
              <span className="stat-caption">LOOK AT YOU GO</span>
            </div>
            <p className="stat-value">{stats.completed}</p>
            <p className="stat-label">Completed</p>
            <div className="stat-bottom">
              <span>{stats.completion}% of all tasks</span>
              <span className="stat-mini-mark">✦</span>
            </div>
          </article>

          <article className="stat-card stat-pending">
            <div className="stat-heading">
              <span className="stat-icon icon-pending">◷</span>
              <span className="stat-caption">STILL IN MOTION</span>
            </div>
            <p className="stat-value">{stats.pending}</p>
            <p className="stat-label">In progress</p>
            <div className="stat-bottom">
              <span>{stats.dueToday} due today</span>
              <span className="stat-mini-mark">→</span>
            </div>
          </article>

          <article className={`stat-card stat-overdue ${stats.overdue ? "has-overdue" : ""}`}>
            <div className="stat-heading">
              <span className="stat-icon icon-overdue">!</span>
              <span className="stat-caption">NEEDS YOUR EYE</span>
            </div>
            <p className="stat-value">{stats.overdue}</p>
            <p className="stat-label">Overdue</p>
            <div className="stat-bottom">
              <span>{stats.overdue ? "A good place to start" : "You're all caught up"}</span>
              <span className="stat-mini-mark">♡</span>
            </div>
          </article>
        </section>

        <section className="progress-panel">
          <div className="progress-copy">
            <div>
              <p className="eyebrow">YOUR DAILY MOMENTUM</p>
              <h2>Every step counts.</h2>
            </div>
            <div className="progress-percentage">
              <strong>{stats.completion}%</strong>
              <span>complete</span>
            </div>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Task completion"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={stats.completion}
          >
            <div className="progress-fill" style={{ width: `${stats.completion}%` }} />
          </div>
          <div className="progress-foot">
            <span>{stats.completed} done</span>
            <span>{stats.pending} left to go</span>
          </div>
        </section>

        <section className="workspace">
          <aside className="panel form-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{editingId ? "MAKE A CHANGE" : "START SMALL"}</p>
                <h2>{editingId ? "Edit your task" : "Add a little step"}</h2>
                <p className="panel-description">
                  {editingId
                    ? "A quick update is all it takes."
                    : "Big things begin with one small action."}
                </p>
              </div>
              <span className="heading-symbol">{editingId ? "✎" : "＋"}</span>
            </div>

            <form className="task-form" onSubmit={handleSubmit}>
              <label className="field">
                <span>Task title <b>*</b></span>
                <input
                  name="title"
                  value={form.title}
                  onChange={updateForm}
                  placeholder="What would you like to do?"
                  maxLength={120}
                  required
                />
              </label>

              <label className="field">
                <span>A little more detail <small>OPTIONAL</small></span>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={updateForm}
                  placeholder="Add a note, a thought, or a next step..."
                  rows={3}
                  maxLength={500}
                />
              </label>

              <div className="field-grid">
                <label className="field">
                  <span>Category</span>
                  <select name="category" value={form.category} onChange={updateForm}>
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Priority</span>
                  <select name="priority" value={form.priority} onChange={updateForm}>
                    {PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>{priority}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="field">
                <span>Due date <small>OPTIONAL</small></span>
                <input
                  type="datetime-local"
                  name="dueAt"
                  value={form.dueAt}
                  onChange={updateForm}
                />
              </label>

              <label className="field">
                <span>Reminder <small>OPTIONAL</small></span>
                <input
                  type="datetime-local"
                  name="reminderAt"
                  value={form.reminderAt}
                  onChange={updateForm}
                />
                <small className="field-hint">
                  Turn on browser reminders above to receive notifications.
                </small>
              </label>

              <div className="form-actions">
                <button className="button button-primary" type="submit">
                  <span>{editingId ? "✓" : "＋"}</span>
                  {editingId ? "Save changes" : "Add my task"}
                </button>
                {editingId && (
                  <button className="button button-quiet" type="button" onClick={resetForm}>
                    Cancel
                  </button>
                )}
              </div>
            </form>

            <div className="gentle-tip">
              <span>✦</span>
              <p><strong>A gentle reminder</strong> — you don't have to do it all today.</p>
            </div>
          </aside>

          <section className="panel list-panel">
            <div className="list-heading">
              <div>
                <p className="eyebrow">YOUR PERSONAL CHECKLIST</p>
                <h2>Today's focus <span className="task-count">{filteredTasks.length}</span></h2>
                <p className="panel-description">Keep your attention on what matters most.</p>
              </div>
              <button
                className="clear-completed-button"
                type="button"
                onClick={clearCompleted}
                disabled={!stats.completed}
              >
                Clear completed
              </button>
            </div>

            <label className="search-box">
              <span aria-hidden="true">⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search your tasks..."
                aria-label="Search tasks"
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} aria-label="Clear search">
                  ×
                </button>
              )}
            </label>

            <div className="status-tabs" aria-label="Filter tasks by status">
              {["All", "Pending", "Completed", "Overdue"].map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`status-tab ${statusFilter === status ? "active" : ""}`}
                  onClick={() => setStatusFilter(status)}
                >
                  {status}
                  {status === "All" && <span>{stats.total}</span>}
                  {status === "Pending" && <span>{stats.pending}</span>}
                  {status === "Completed" && <span>{stats.completed}</span>}
                  {status === "Overdue" && <span>{stats.overdue}</span>}
                </button>
              ))}
            </div>

            <div className="filter-row">
              <label className="compact-filter">
                <span>Category</span>
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="All">All categories</option>
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>

              <label className="compact-filter">
                <span>Priority</span>
                <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
                  <option value="All">All priorities</option>
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </select>
              </label>

              <label className="compact-filter sort-filter">
                <span>Sort by</span>
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                  <option value="newest">Recently added</option>
                  <option value="oldest">Oldest first</option>
                  <option value="dueDate">Due date</option>
                  <option value="priority">Priority</option>
                  <option value="title">Task name</option>
                </select>
              </label>
            </div>

            {hasActiveFilters && (
              <div className="filter-summary">
                <span>Showing filtered results</span>
                <button type="button" onClick={clearFilters}>Reset filters ×</button>
              </div>
            )}

            {filteredTasks.length === 0 ? (
              <div className="empty-state">
                <div className="empty-illustration">
                  <span className="empty-sun">✳</span>
                  <span className="empty-check">✓</span>
                </div>
                <h3>{tasks.length ? "Nothing matches just yet." : "A fresh page, just for you."}</h3>
                <p>
                  {tasks.length
                    ? "Try changing your filters or search for something else."
                    : "Add your first little step and give your day a gentle direction."}
                </p>
                {tasks.length > 0 && hasActiveFilters && (
                  <button className="button button-secondary" type="button" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div className="task-list">
                {filteredTasks.map((task, index) => (
                  <article
                    key={task.id}
                    className={`task-card ${task.completed ? "is-completed" : ""} ${isOverdue(task) ? "is-overdue" : ""}`}
                    style={{ "--task-index": index }}
                  >
                    <button
                      type="button"
                      className={`task-checkbox ${task.completed ? "checked" : ""}`}
                      onClick={() => toggleTask(task.id)}
                      aria-label={task.completed ? `Mark ${task.title} as pending` : `Complete ${task.title}`}
                    >
                      {task.completed ? "✓" : ""}
                    </button>

                    <div className="task-content">
                      <div className="task-title-row">
                        <h3>{task.title}</h3>
                        <span className={`priority-pill priority-${task.priority.toLowerCase()}`}>
                          <i />{task.priority}
                        </span>
                      </div>

                      {task.description && (
                        <p className="task-description">{task.description}</p>
                      )}

                      <div className="task-metadata">
                        <span className="category-pill">{task.category}</span>
                        <span className={`due-pill ${isOverdue(task) ? "due-overdue" : ""} ${task.completed ? "due-completed" : ""}`}>
                          <span aria-hidden="true">◷</span>
                          {getDueLabel(task)}
                        </span>
                        {task.reminderAt && !task.completed && (
                          <span className="reminder-pill">♧ Reminder set</span>
                        )}
                      </div>
                    </div>

                    <div className="task-actions">
                      <button
                        type="button"
                        className="task-action"
                        onClick={() => editTask(task)}
                        aria-label={`Edit ${task.title}`}
                        title="Edit task"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="task-action delete-action"
                        onClick={() => deleteTask(task.id)}
                        aria-label={`Delete ${task.title}`}
                        title="Delete task"
                      >
                        ×
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div className="list-footer">
              <span><span className="footer-status-dot" /> Your tasks are saved automatically</span>
              <span>{stats.completed} of {stats.total} completed</span>
            </div>
          </section>
        </section>

        <footer className="app-footer">
          <a className="footer-brand" href="#"><span className="brand-mark mini-mark">ls.</span> little steps</a>
          <p>Made for your goals, your space, your life. <span>♡</span></p>
          <span className="footer-motto">ONE DAY AT A TIME</span>
        </footer>
      </main>

      {toast && (
        <div className="toast-message" role="status">
          <span>✓</span>{toast}
        </div>
      )}
    </div>
  );
}

export default App;
