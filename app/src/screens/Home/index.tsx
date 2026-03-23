import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTasks, applyWsEvent } from "../../hooks/useTasks";
import { useWebSocket, type WsStatus } from "../../hooks/useWebSocket";
import { usePushNotifications } from "../../hooks/usePushNotifications";
import { api } from "../../lib/api";
import type { Task, TaskStatus, WsServerEvent } from "../../lib/types";

const STATUS_ICON: Record<TaskStatus, string> = {
  queued: "...",
  running: "\u25B6",
  waiting_approval: "\u23F8",
  completed: "\u2713",
  failed: "\u2717",
  stopped: "\u23F9",
};

const STATUS_COLOR: Record<TaskStatus, string> = {
  queued: "text-gray-400",
  running: "text-blue-400",
  waiting_approval: "text-amber-400",
  completed: "text-emerald-400",
  failed: "text-red-400",
  stopped: "text-gray-500",
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function HomeScreen() {
  const navigate = useNavigate();
  const { tasks: initialTasks, loading, refresh } = useTasks();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showConnInfo, setShowConnInfo] = useState(false);

  usePushNotifications();

  // Sync initial load into local state
  if (initialTasks.length > 0 && tasks.length === 0 && !refreshing) {
    setTasks(initialTasks);
  }

  const onWsEvent = useCallback((event: WsServerEvent) => {
    setTasks((prev) => applyWsEvent(prev, event));
  }, []);

  const { status: wsStatus } = useWebSocket(onWsEvent);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    const data = await api.tasks.list();
    setTasks(data);
    setRefreshing(false);
  };

  const handleStop = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await api.tasks.stop(taskId);
  };

  const activeTasks = tasks.filter((t) =>
    ["queued", "running", "waiting_approval"].includes(t.status)
  );
  const completedTasks = tasks.filter((t) =>
    ["completed", "failed", "stopped"].includes(t.status)
  );

  return (
    <div className="flex flex-col min-h-dvh bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Claude Remote</h1>
          <button
            onClick={() => setShowConnInfo((v) => !v)}
            className="relative"
            aria-label="Connection status"
          >
            <ConnectionDot status={wsStatus} />
          </button>
        </div>
        <button
          onClick={() => navigate("/settings")}
          className="flex items-center justify-center w-11 h-11 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
          aria-label="Settings"
        >
          \u2699
        </button>
      </header>
      {showConnInfo && (
        <div className="px-4 py-2 bg-gray-900 border-b border-gray-800 text-xs text-gray-400">
          <p>Status: {wsStatus}</p>
          <p>Server: {window.location.hostname}:{window.location.port === "5173" ? "3000" : window.location.port}</p>
        </div>
      )}

      {/* Reconnecting banner */}
      {(wsStatus === "disconnected" || wsStatus === "error") && (
        <div className="px-4 py-2 bg-amber-900/80 border-b border-amber-700 flex items-center gap-2">
          <span className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-amber-200">Reconnecting...</span>
        </div>
      )}

      {/* Task list */}
      <main className="flex-1 px-4 py-4 overflow-y-auto">
        {loading && tasks.length === 0 ? (
          <div className="flex flex-col gap-3 mt-4">
            {[1, 2, 3].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-gray-500 text-sm text-center mt-16">
            No tasks yet. Start one below.
          </p>
        ) : (
          <>
            {/* Pull to refresh button */}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-full text-xs text-gray-600 hover:text-gray-400 py-1 mb-3 transition-colors"
            >
              {refreshing ? "Refreshing..." : "Pull to refresh"}
            </button>

            {/* Active tasks */}
            {activeTasks.length > 0 && (
              <section className="mb-6">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Active
                </h2>
                <div className="flex flex-col gap-3">
                  {activeTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onTap={() => navigate(`/tasks/${task.id}`)}
                      onStop={handleStop}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Completed tasks */}
            {completedTasks.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Recent
                </h2>
                <div className="flex flex-col gap-3">
                  {completedTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onTap={() => navigate(`/tasks/${task.id}`)}
                      onStop={handleStop}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* New Task button */}
      <footer className="px-4 py-4 border-t border-gray-800">
        <button
          onClick={() => navigate("/new")}
          className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
        >
          + New Task
        </button>
      </footer>
    </div>
  );
}

function TaskCard({
  task,
  onTap,
  onStop,
}: {
  task: Task;
  onTap: () => void;
  onStop: (taskId: string, e: React.MouseEvent) => void;
}) {
  const isActive = ["queued", "running", "waiting_approval"].includes(
    task.status
  );

  return (
    <div
      onClick={onTap}
      className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3 cursor-pointer hover:bg-gray-800/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-sm ${STATUS_COLOR[task.status]}`}>
              {STATUS_ICON[task.status]}
            </span>
            <span className="text-sm font-medium truncate">{task.repo}</span>
            {!isActive && (
              <span className="text-xs text-gray-600">
                {timeAgo(task.updatedAt)}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 truncate">
            {task.summary || task.prompt}
          </p>
          {task.status === "failed" && task.error && (
            <p className="text-xs text-red-400/70 truncate mt-1">
              {task.error}
            </p>
          )}
          {task.filesChanged && task.filesChanged.length > 0 && (
            <p className="text-xs text-gray-600 mt-1">
              {task.filesChanged.length} file
              {task.filesChanged.length === 1 ? "" : "s"} changed
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {task.status === "waiting_approval" && (
            <span className="text-xs bg-amber-900/50 text-amber-400 px-2 py-0.5 rounded-full">
              Review
            </span>
          )}
          {isActive && (
            <button
              onClick={(e) => onStop(task.id, e)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors"
              aria-label="Stop task"
            >
              \u23F9
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ConnectionDot({ status }: { status: WsStatus }) {
  const colors: Record<WsStatus, string> = {
    connected: "bg-emerald-400",
    connecting: "bg-amber-400 animate-pulse",
    disconnected: "bg-red-400",
    error: "bg-red-400",
  };
  return <span className={`w-2.5 h-2.5 rounded-full ${colors[status]}`} />;
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3 animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-4 h-4 rounded-full bg-gray-800" />
        <div className="h-3 w-24 bg-gray-800 rounded" />
      </div>
      <div className="h-2.5 w-48 bg-gray-800 rounded" />
    </div>
  );
}
