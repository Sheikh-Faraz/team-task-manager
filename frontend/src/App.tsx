
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./lib/api";

type User = {
  id: string;
  name: string;
  email: string;
};

type Team = {
  id: string;
  name: string;
  description?: string;
  role?: string;
  task_count?: number;
};

type Member = {
  id?: string;
  user_id?: string;
  name: string;
  email: string;
  role?: string;
};

type Task = {
  id: string;
  team_id: string;
  team_name?: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "completed";
  priority: "low" | "medium" | "high";
  assigned_to?: string | null;
  assignee_name?: string | null;
  assignee_email?: string | null;
  created_by: string;
  due_date?: string | null;
};

const statusLabels: Record<Task["status"], string> = {
  todo: "To do",
  in_progress: "In progress",
  completed: "Completed",
};

function getError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");

  const [teamFormOpen, setTeamFormOpen] = useState(false);
  const [teamForm, setTeamForm] = useState({
    name: "",
    description: "",
  });
  const [memberEmail, setMemberEmail] = useState("");

  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    status: "todo" as Task["status"],
    priority: "medium" as Task["priority"],
    assignedTo: "",
    dueDate: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedTeam = teams.find((team) => team.id === selectedTeamId);

  const loadTeams = useCallback(async () => {
    const result = await api<{ teams: Team[] }>("/teams");
    const nextTeams = result.teams ?? [];
    setTeams(nextTeams);

    setSelectedTeamId((current) => {
      if (current && nextTeams.some((team) => team.id === current)) {
        return current;
      }
      return nextTeams[0]?.id ?? "";
    });
  }, []);

  const loadMembers = useCallback(async (teamId: string) => {
    if (!teamId) {
      setMembers([]);
      return;
    }

    const result = await api<{ members: Member[] }>(`/teams/${teamId}`);
    setMembers(result.members ?? []);
  }, []);

  const loadTasks = useCallback(async () => {
    const params = new URLSearchParams();

    if (selectedTeamId) params.set("teamId", selectedTeamId);
    if (search.trim()) params.set("search", search.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (assigneeFilter) params.set("assigneeId", assigneeFilter);

    const result = await api<{ tasks: Task[] }>(
      `/tasks${params.size ? `?${params.toString()}` : ""}`
    );

    setTasks(result.tasks ?? []);
  }, [selectedTeamId, search, statusFilter, assigneeFilter]);

  useEffect(() => {
    api<{ user: User }>("/auth/me")
      .then(async (result) => {
        setUser(result.user);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setInitializing(false));
  }, []);

  useEffect(() => {
    if (!user) return;

    loadTeams().catch((err) => setError(getError(err)));
  }, [user, loadTeams]);

  useEffect(() => {
    if (!user || !selectedTeamId) {
      setMembers([]);
      setTasks([]);
      return;
    }

    loadMembers(selectedTeamId).catch((err) => setError(getError(err)));
  }, [user, selectedTeamId, loadMembers]);

  useEffect(() => {
    if (!user) return;

    loadTasks().catch((err) => setError(getError(err)));
  }, [user, loadTasks]);

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = authMode === "login" ? "/auth/login" : "/auth/register";

      const result = await api<{ user: User }>(endpoint, {
        method: "POST",
        body: JSON.stringify(authForm),
      });

      setUser(result.user);
      setAuthForm({ name: "", email: "", password: "" });
      setNotice(`Welcome${result.user?.name ? `, ${result.user.name}` : ""}!`);
    } catch (err) {
      setError(getError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (err) {
      setError(getError(err));
      return;
    }

    setUser(null);
    setTeams([]);
    setTasks([]);
    setMembers([]);
    setSelectedTeamId("");
    setNotice("");
    setError("");
  }

  async function createTeam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await api<{ team: Team }>("/teams", {
        method: "POST",
        body: JSON.stringify(teamForm),
      });

      setTeamForm({ name: "", description: "" });
      setTeamFormOpen(false);
      await loadTeams();

      if (result.team?.id) setSelectedTeamId(result.team.id);
      setNotice("Team created successfully.");
    } catch (err) {
      setError(getError(err));
    } finally {
      setLoading(false);
    }
  }

  async function addMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTeamId) return;

    setError("");
    setLoading(true);

    try {
      await api(`/teams/${selectedTeamId}/members`, {
        method: "POST",
        body: JSON.stringify({ email: memberEmail.trim() }),
      });

      setMemberEmail("");
      await loadMembers(selectedTeamId);
      setNotice("Team member added.");
    } catch (err) {
      setError(getError(err));
    } finally {
      setLoading(false);
    }
  }

  function openNewTask() {
    setEditingTaskId(null);
    setTaskForm({
      title: "",
      description: "",
      status: "todo",
      priority: "medium",
      assignedTo: "",
      dueDate: "",
    });
    setTaskFormOpen(true);
  }

  function openEditTask(task: Task) {
    setEditingTaskId(task.id);
    setTaskForm({
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      priority: task.priority,
      assignedTo: task.assigned_to ?? "",
      dueDate: task.due_date ? task.due_date.slice(0, 10) : "",
    });
    setTaskFormOpen(true);
  }

  async function saveTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedTeamId) {
      setError("Create or select a team first.");
      return;
    }

    setError("");
    setLoading(true);

    const body = {
      ...(editingTaskId ? {} : { teamId: selectedTeamId }),
      title: taskForm.title.trim(),
      description: taskForm.description.trim(),
      status: taskForm.status,
      priority: taskForm.priority,
      assignedTo: taskForm.assignedTo || null,
      dueDate: taskForm.dueDate
        ? new Date(`${taskForm.dueDate}T23:59:00`).toISOString()
        : null,
    };

    try {
      if (editingTaskId) {
        await api(`/tasks/${editingTaskId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await api("/tasks", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }

      setTaskFormOpen(false);
      await loadTasks();
      await loadTeams();
      setNotice(editingTaskId ? "Task updated." : "Task created.");
    } catch (err) {
      setError(getError(err));
    } finally {
      setLoading(false);
    }
  }

  async function deleteTask(task: Task) {
    if (!window.confirm(`Delete "${task.title}"?`)) return;

    setError("");

    try {
      await api(`/tasks/${task.id}`, { method: "DELETE" });
      await loadTasks();
      await loadTeams();
      setNotice("Task deleted.");
    } catch (err) {
      setError(getError(err));
    }
  }

  const counts = useMemo(
    () => ({
      total: tasks.length,
      todo: tasks.filter((task) => task.status === "todo").length,
      progress: tasks.filter((task) => task.status === "in_progress").length,
      completed: tasks.filter((task) => task.status === "completed").length,
    }),
    [tasks]
  );

  if (initializing) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 text-slate-600">
        Checking your session...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-8">
            <div className="mb-4 grid size-12 place-items-center rounded-xl bg-indigo-600 text-xl font-bold text-white">
              T
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Team Task Manager
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Organize your team. Get work done.
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 rounded-lg bg-slate-100 p-1">
            {(["login", "register"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  setAuthMode(mode);
                  setError("");
                }}
                className={`rounded-md px-3 py-2 text-sm font-medium capitalize ${
                  authMode === mode
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                {mode === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          {error && (
            <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === "register" && (
              <Field
                label="Full name"
                value={authForm.name}
                onChange={(name) => setAuthForm({ ...authForm, name })}
                placeholder="Your name"
                required
              />
            )}
            <Field
              label="Email"
              type="email"
              value={authForm.email}
              onChange={(email) => setAuthForm({ ...authForm, email })}
              placeholder="you@example.com"
              required
            />
            <Field
              label="Password"
              type="password"
              value={authForm.password}
              onChange={(password) => setAuthForm({ ...authForm, password })}
              placeholder="Enter your password"
              required
            />
            <button
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading
                ? "Please wait..."
                : authMode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-indigo-600 font-bold text-white">
              T
            </div>
            <div>
              <p className="font-bold">Team Task Manager</p>
              <p className="text-xs text-slate-500">Workspace dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{user.name}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-indigo-600">OVERVIEW</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Welcome back, {user.name.split(" ")[0]}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Manage teams and keep your tasks moving.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTeamFormOpen(true)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"
            >
              + New team
            </button>
            <button
              onClick={openNewTask}
              disabled={!selectedTeamId}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              + New task
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-5 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label="Dismiss error">
              ×
            </button>
          </div>
        )}

        {notice && (
          <div className="mb-5 flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <span>{notice}</span>
            <button onClick={() => setNotice("")} aria-label="Dismiss notice">
              ×
            </button>
          </div>
        )}

        <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Tasks shown" value={counts.total} detail="Current filters" />
          <Stat label="To do" value={counts.todo} detail="Ready to start" />
          <Stat label="In progress" value={counts.progress} detail="Being worked on" />
          <Stat label="Completed" value={counts.completed} detail="Finished tasks" />
        </section>

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold">Your teams</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {teams.length}
                </span>
              </div>

              {teams.length === 0 ? (
                <p className="text-sm leading-6 text-slate-500">
                  No teams yet. Create a team to start organizing tasks.
                </p>
              ) : (
                <div className="space-y-1">
                  {teams.map((team) => (
                    <button
                      key={team.id}
                      onClick={() => setSelectedTeamId(team.id)}
                      className={`flex w-full items-start gap-3 rounded-lg p-3 text-left ${
                        selectedTeamId === team.id
                          ? "bg-indigo-50 text-indigo-800"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 font-semibold text-slate-700">
                        {team.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {team.name}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {team.task_count ?? 0} tasks
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {selectedTeam && (
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="font-semibold">Team members</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedTeam.name}
                </p>

                <div className="my-4 space-y-3">
                  {members.map((member) => (
                    <div
                      key={member.user_id ?? member.id ?? member.email}
                      className="flex items-center gap-2"
                    >
                      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                        {member.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{member.name}</p>
                        <p className="truncate text-xs text-slate-500">{member.email}</p>
                      </div>
                    </div>
                  ))}
                  {members.length === 0 && (
                    <p className="text-sm text-slate-500">
                      No member details available.
                    </p>
                  )}
                </div>

                {selectedTeam.role === "creator" && (
                  <form onSubmit={addMember} className="border-t border-slate-100 pt-4">
                    <label className="mb-2 block text-xs font-semibold text-slate-600">
                      Add a registered user
                    </label>
                    <input
                      type="email"
                      required
                      value={memberEmail}
                      onChange={(event) => setMemberEmail(event.target.value)}
                      placeholder="member@example.com"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    />
                    <button
                      disabled={loading}
                      className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
                    >
                      Add member
                    </button>
                  </form>
                )}
              </section>
            )}
          </aside>

          <section className="min-w-0">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tasks..."
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
              >
                <option value="">All statuses</option>
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
              </select>
              <select
                value={assigneeFilter}
                onChange={(event) => setAssigneeFilter(event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
              >
                <option value="">All assignees</option>
                <option value="unassigned">Unassigned</option>
                {members.map((member) => (
                  <option
                    key={member.user_id ?? member.id ?? member.email}
                    value={member.user_id ?? member.id}
                  >
                    {member.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">
                  {selectedTeam?.name ?? "Tasks"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Tasks you have access to
                </p>
              </div>
              <button
                onClick={() => loadTasks().catch((err) => setError(getError(err)))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
              >
                Refresh
              </button>
            </div>

            <div className="space-y-3">
              {tasks.map((task) => (
                <article
                  key={task.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 sm:p-5"
                >
                  <div className="flex flex-col justify-between gap-4 sm:flex-row">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          task.status === "completed"
                            ? "bg-emerald-50 text-emerald-700"
                            : task.status === "in_progress"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-slate-100 text-slate-600"
                        }`}>
                          {statusLabels[task.status]}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          task.priority === "high"
                            ? "bg-red-50 text-red-700"
                            : task.priority === "low"
                              ? "bg-slate-100 text-slate-600"
                              : "bg-amber-50 text-amber-700"
                        }`}>
                          {task.priority} priority
                        </span>
                      </div>
                      <h3 className="font-semibold">{task.title}</h3>
                      {task.description && (
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-500">
                          {task.description}
                        </p>
                      )}
                      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
                        <span>
                          Assigned to: {task.assignee_name ?? "Unassigned"}
                        </span>
                        {task.due_date && (
                          <span>
                            Due {new Date(task.due_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-start gap-2">
                      <button
                        onClick={() => openEditTask(task)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      {(task.created_by === user.id ||
                        selectedTeam?.role === "creator") && (
                        <button
                          onClick={() => deleteTask(task)}
                          className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}

              {tasks.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
                  <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-slate-100 text-xl">
                    ✓
                  </div>
                  <h3 className="font-semibold">No tasks found</h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
                    {teams.length === 0
                      ? "Create a team first, then add your first task."
                      : "Try changing the filters or create a new task for this team."}
                  </p>
                  {selectedTeamId && (
                    <button
                      onClick={openNewTask}
                      className="mt-5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                      Create task
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {teamFormOpen && (
        <Modal title="Create a team" onClose={() => setTeamFormOpen(false)}>
          <form onSubmit={createTeam} className="space-y-4">
            <Field
              label="Team name"
              value={teamForm.name}
              onChange={(name) => setTeamForm({ ...teamForm, name })}
              placeholder="e.g. Product team"
              required
            />
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Description</span>
              <textarea
                value={teamForm.description}
                onChange={(event) =>
                  setTeamForm({ ...teamForm, description: event.target.value })
                }
                rows={3}
                placeholder="What does this team work on?"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
            </label>
            <ModalActions
              loading={loading}
              submitLabel="Create team"
              onCancel={() => setTeamFormOpen(false)}
            />
          </form>
        </Modal>
      )}

      {taskFormOpen && (
        <Modal
          title={editingTaskId ? "Edit task" : "Create a task"}
          onClose={() => setTaskFormOpen(false)}
        >
          <form onSubmit={saveTask} className="space-y-4">
            <Field
              label="Title"
              value={taskForm.title}
              onChange={(title) => setTaskForm({ ...taskForm, title })}
              placeholder="What needs to be done?"
              required
            />
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Description</span>
              <textarea
                value={taskForm.description}
                onChange={(event) =>
                  setTaskForm({ ...taskForm, description: event.target.value })
                }
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                placeholder="Add details..."
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Status</span>
                <select
                  value={taskForm.status}
                  onChange={(event) =>
                    setTaskForm({
                      ...taskForm,
                      status: event.target.value as Task["status"],
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
                >
                  <option value="todo">To do</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Priority</span>
                <select
                  value={taskForm.priority}
                  onChange={(event) =>
                    setTaskForm({
                      ...taskForm,
                      priority: event.target.value as Task["priority"],
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Assign to</span>
              <select
                value={taskForm.assignedTo}
                onChange={(event) =>
                  setTaskForm({ ...taskForm, assignedTo: event.target.value })
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
              >
                <option value="">Unassigned</option>
                {members.map((member) => {
                  const id = member.user_id ?? member.id;
                  return id ? (
                    <option key={id} value={id}>
                      {member.name} ({member.email})
                    </option>
                  ) : null;
                })}
              </select>
            </label>

            <Field
              label="Due date"
              type="date"
              value={taskForm.dueDate}
              onChange={(dueDate) => setTaskForm({ ...taskForm, dueDate })}
            />

            <ModalActions
              loading={loading}
              submitLabel={editingTaskId ? "Save changes" : "Create task"}
              onCancel={() => setTaskFormOpen(false)}
            />
          </form>
        </Modal>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      />
    </label>
  );
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{detail}</p>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="my-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-lg text-xl text-slate-500 hover:bg-slate-100"
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({
  loading,
  submitLabel,
  onCancel,
}: {
  loading: boolean;
  submitLabel: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"
      >
        Cancel
      </button>
      <button
        disabled={loading}
        className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {loading ? "Saving..." : submitLabel}
      </button>
    </div>
  );
}
