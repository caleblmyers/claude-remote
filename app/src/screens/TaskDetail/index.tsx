import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import type { TaskWithPermissions } from "../../lib/api";
import type { TrustLevel } from "../../lib/types";
import { useWebSocket } from "../../hooks/useWebSocket";
import type {
  WsServerEvent,
  StreamEvent,
  PermissionRequest,
} from "../../lib/types";

export default function TaskDetailScreen() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [task, setTask] = useState<TaskWithPermissions | null>(null);
  const [taskLoading, setTaskLoading] = useState(true);
  const [output, setOutput] = useState<StreamEvent[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const savedCountRef = useRef(0);
  const [eventsLoading, setEventsLoading] = useState(true);

  // Fetch task data
  useEffect(() => {
    if (!id) return;
    setTaskLoading(true);
    api.tasks.get(id).then(setTask).catch(console.error).finally(() => setTaskLoading(false));
  }, [id]);

  // Load persisted events
  useEffect(() => {
    if (!id) return;
    setEventsLoading(true);
    api.tasks.events(id).then((saved) => {
      const parsed: StreamEvent[] = saved.map((e) => JSON.parse(e.data));
      savedCountRef.current = parsed.length;
      setOutput(parsed);
    }).catch(() => {}).finally(() => setEventsLoading(false));
  }, [id]);

  // WebSocket event handling
  const onWsEvent = useCallback(
    (event: WsServerEvent) => {
      if (!id) return;

      if (event.type === "task:stream" && event.taskId === id) {
        setOutput((prev) => {
          // Deduplicate against saved events
          if (savedCountRef.current > 0) {
            const last = prev[savedCountRef.current - 1];
            if (last && last.type === event.event.type && last.content === event.event.content) {
              savedCountRef.current--;
              return prev;
            }
          }
          return [...prev, event.event];
        });
      }

      if (event.type === "task:status_change" && event.taskId === id) {
        setTask((prev) =>
          prev ? { ...prev, status: event.newStatus! } : prev
        );
      }

      if (event.type === "task:complete" && event.taskId === id) {
        setTask((prev) =>
          prev
            ? {
                ...prev,
                status: "completed",
                summary: event.summary,
                filesChanged: event.filesChanged,
              }
            : prev
        );
      }

      if (event.type === "task:error" && event.taskId === id) {
        setTask((prev) =>
          prev ? { ...prev, status: "failed", error: event.error } : prev
        );
      }

      if (event.type === "task:permission" && event.taskId === id) {
        const perm: PermissionRequest = {
          id: event.requestId,
          taskId: event.taskId,
          tool: event.tool,
          input: event.input,
          reasoning: event.reasoning,
          status: "pending",
          createdAt: new Date().toISOString(),
        };
        setTask((prev) =>
          prev
            ? {
                ...prev,
                status: "waiting_approval",
                pendingPermissions: [
                  ...(prev.pendingPermissions ?? []),
                  perm,
                ],
              }
            : prev
        );
      }
    },
    [id]
  );

  useWebSocket(onWsEvent);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const handleStop = async () => {
    if (!id) return;
    try {
      await api.tasks.stop(id);
    } catch (err: any) {
      setActionError(`Failed to stop task: ${err.message}`);
    }
  };

  const handleReply = async () => {
    if (!id || !reply.trim() || sending) return;
    const message = reply.trim();
    setSending(true);
    // Optimistic: show user message in output stream immediately
    setOutput((prev) => [...prev, { type: "user_message", content: message }]);
    setReply("");
    try {
      await api.tasks.reply(id, message);
      // Optimistic: update status to running
      setTask((prev) => (prev ? { ...prev, status: "running" } : prev));
    } catch (err: any) {
      setActionError(`Failed to send reply: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    if (!id) return;
    try {
      await api.tasks.approve(id, requestId);
      setTask((prev) =>
        prev
          ? {
              ...prev,
              pendingPermissions: prev.pendingPermissions?.filter(
                (p) => p.id !== requestId
              ),
            }
          : prev
      );
    } catch (err: any) {
      setActionError(`Failed to approve: ${err.message}`);
    }
  };

  const handleDeny = async (requestId: string) => {
    if (!id) return;
    try {
      await api.tasks.deny(id, requestId);
      setTask((prev) =>
        prev
          ? {
              ...prev,
              pendingPermissions: prev.pendingPermissions?.filter(
                (p) => p.id !== requestId
              ),
            }
          : prev
      );
    } catch (err: any) {
      setActionError(`Failed to deny: ${err.message}`);
    }
  };

  const handleAutoApprove = async (tool: string) => {
    if (!id) return;
    try {
      const result = await api.escalate(id, tool);
      // Update local trust level
      setTask((prev) =>
        prev ? { ...prev, trustLevel: result.trustLevel as TrustLevel } : prev
      );
    } catch (err: any) {
      setActionError(`Failed to auto-approve: ${err.message}`);
    }
  };

  const handleRetry = async () => {
    if (!task) return;
    try {
      const newTask = await api.tasks.create({
        repo: task.repo,
        prompt: task.prompt,
        trustLevel: task.trustLevel,
      });
      navigate(`/tasks/${newTask.id}`, { replace: true });
    } catch (err: any) {
      setActionError(`Failed to retry: ${err.message}`);
    }
  };

  const handleRetryWithChanges = () => {
    if (!task) return;
    navigate(`/new?repo=${encodeURIComponent(task.repo)}&prompt=${encodeURIComponent(task.prompt)}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleReply();
    }
  };

  if (taskLoading || !task) {
    return (
      <div className="flex flex-col min-h-dvh bg-gray-950 text-gray-100">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 shrink-0">
          <div className="w-11 h-11 rounded-lg bg-gray-800 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 bg-gray-800 rounded animate-pulse" />
            <div className="h-3 w-20 bg-gray-800 rounded animate-pulse" />
          </div>
        </header>
        <section className="px-4 py-3 border-b border-gray-800">
          <div className="h-3 w-16 bg-gray-800 rounded animate-pulse mb-2" />
          <div className="h-4 w-full bg-gray-800 rounded animate-pulse" />
        </section>
        <section className="flex-1 px-4 py-3 space-y-2">
          <div className="h-3 w-3/4 bg-gray-800 rounded animate-pulse" />
          <div className="h-3 w-1/2 bg-gray-800 rounded animate-pulse" />
          <div className="h-3 w-2/3 bg-gray-800 rounded animate-pulse" />
          <div className="h-3 w-1/3 bg-gray-800 rounded animate-pulse" />
        </section>
      </div>
    );
  }

  const isActive = ["queued", "running", "waiting_approval"].includes(
    task.status
  );
  const pendingPerms = task.pendingPermissions?.filter(
    (p) => p.status === "pending"
  );

  return (
    <div className="flex flex-col min-h-dvh bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 shrink-0">
        <button
          onClick={() => navigate("/")}
          className="flex items-center justify-center w-11 h-11 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
          aria-label="Back"
        >
          \u25C0
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold truncate">
            {task.repo}: {task.prompt.slice(0, 40)}
            {task.prompt.length > 40 ? "..." : ""}
          </h1>
          <StatusBadge status={task.status} />
        </div>
        {isActive && (
          <button
            onClick={handleStop}
            className="flex items-center justify-center w-11 h-11 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors"
            aria-label="Stop task"
          >
            \u23F9
          </button>
        )}
      </header>

      {/* Summary panel */}
      <section
        className={`px-4 py-3 border-b border-gray-800 shrink-0 ${
          summaryCollapsed ? "cursor-pointer" : ""
        }`}
        onClick={() => setSummaryCollapsed(!summaryCollapsed)}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Summary
          </h2>
          <span className="text-xs text-gray-600">
            {summaryCollapsed ? "\u25BC" : "\u25B2"}
          </span>
        </div>
        {!summaryCollapsed && (
          <div className="text-sm text-gray-300 space-y-1">
            <p>{task.summary || task.prompt}</p>
            {task.filesChanged && task.filesChanged.length > 0 && (
              <p className="text-xs text-gray-500">
                Files: {task.filesChanged.join(", ")}
              </p>
            )}
            {task.error && (
              <p className="text-xs text-red-400">{task.error}</p>
            )}
            {task.status === "failed" && (
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleRetry}
                  className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                >
                  Retry
                </button>
                <button
                  onClick={handleRetryWithChanges}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
                >
                  Retry with changes
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Inline approval cards */}
      {pendingPerms && pendingPerms.length > 0 && (
        <section className="px-4 py-3 border-b border-amber-800/50 bg-amber-950/20 shrink-0">
          {pendingPerms.map((perm) => (
            <ApprovalCard
              key={perm.id}
              perm={perm}
              onApprove={() => handleApprove(perm.id)}
              onDeny={() => handleDeny(perm.id)}
              onAutoApprove={handleAutoApprove}
            />
          ))}
        </section>
      )}

      {/* Action error bar */}
      {actionError && (
        <div className="px-4 py-2 bg-red-950/30 border-b border-red-800/50 flex items-center justify-between shrink-0">
          <p className="text-xs text-red-400">{actionError}</p>
          <button
            onClick={() => setActionError(null)}
            className="text-xs text-red-500 hover:text-red-300 ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Output stream */}
      <section
        ref={outputRef}
        className="flex-1 px-4 py-3 overflow-y-auto font-mono text-xs leading-relaxed"
      >
        {/* Show the user's prompt as the first entry */}
        <div className="text-indigo-400 mb-2 pb-2 border-b border-gray-800">
          &gt; {task.prompt}
        </div>

        {eventsLoading ? (
          <div className="space-y-2">
            <div className="h-3 w-3/4 bg-gray-800 rounded animate-pulse" />
            <div className="h-3 w-1/2 bg-gray-800 rounded animate-pulse" />
            <div className="h-3 w-2/3 bg-gray-800 rounded animate-pulse" />
          </div>
        ) : output.length === 0 ? (
          <p className="text-gray-600 animate-pulse">
            {isActive ? "Running..." : "No output recorded."}
          </p>
        ) : (
          output.map((entry, i) => <OutputEntry key={i} entry={entry} />)
        )}
      </section>

      {/* Reply input — only visible for resumable finished tasks */}
      {task.sessionId &&
        (task.status === "completed" ||
          task.status === "stopped" ||
          task.status === "failed") && (
          <footer className="px-4 py-3 border-t border-gray-800 flex gap-3 shrink-0">
            <input
              type="text"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                task.status === "completed"
                  ? "Continue this conversation..."
                  : task.status === "stopped"
                    ? "Resume this task..."
                    : "Retry with a message..."
              }
              className="flex-1 h-11 bg-gray-900 border border-gray-800 rounded-lg px-3 text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={handleReply}
              disabled={!reply.trim() || sending}
              className="h-11 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              Send
            </button>
          </footer>
        )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    queued: "bg-gray-800 text-gray-400",
    running: "bg-blue-900/50 text-blue-400",
    waiting_approval: "bg-amber-900/50 text-amber-400",
    completed: "bg-emerald-900/50 text-emerald-400",
    failed: "bg-red-900/50 text-red-400",
    stopped: "bg-gray-800 text-gray-500",
  };
  return (
    <span
      className={`inline-block text-xs px-2 py-0.5 rounded-full mt-0.5 ${
        colors[status] ?? colors.queued
      }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function ApprovalCard({
  perm,
  onApprove,
  onDeny,
  onAutoApprove,
}: {
  perm: PermissionRequest;
  onApprove: () => void;
  onDeny: () => void;
  onAutoApprove: (tool: string) => void;
}) {
  const [acting, setActing] = useState(false);
  const toolDisplay = formatToolInput(perm.tool, perm.input);

  const wrap = (fn: () => void) => async () => {
    setActing(true);
    try {
      await fn();
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="mb-3 last:mb-0">
      <p className="text-sm text-amber-400 font-medium mb-2">
        \u26A0 Claude wants to use: {perm.tool}
      </p>

      <div className="bg-gray-900 rounded-lg px-3 py-2 font-mono text-xs text-gray-300 mb-2 overflow-x-auto">
        {toolDisplay}
      </div>

      {perm.reasoning && (
        <p className="text-xs text-gray-500 mb-3">Why: {perm.reasoning}</p>
      )}

      <div className="flex gap-3">
        <button
          onClick={wrap(onDeny)}
          disabled={acting}
          className="flex-1 h-12 rounded-xl border border-red-800 text-red-400 hover:bg-red-950/40 font-medium transition-colors disabled:opacity-40"
        >
          \u2717 Deny
        </button>
        <button
          onClick={wrap(onApprove)}
          disabled={acting}
          className="flex-1 h-12 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-medium transition-colors disabled:opacity-40"
        >
          \u2713 Approve
        </button>
      </div>

      <button
        onClick={() => onAutoApprove(perm.tool)}
        className="w-full text-xs text-indigo-400 hover:text-indigo-300 mt-2 py-1 transition-colors"
      >
        Auto-approve {perm.tool} for this session
      </button>
    </div>
  );
}

function formatToolInput(tool: string, input: Record<string, unknown>): string {
  const t = tool.toLowerCase();
  if (t.includes("bash") && input.command) {
    return `$ ${input.command}`;
  }
  if (t.includes("edit") && input.file_path) {
    return `Edit: ${input.file_path}`;
  }
  if (t.includes("write") && input.file_path) {
    return `Write: ${input.file_path}`;
  }
  if (t.includes("read") && input.file_path) {
    return `Read: ${input.file_path}`;
  }
  // Fallback: show tool name and input
  const entries = Object.entries(input);
  if (entries.length === 0) return tool;
  return entries.map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join("\n");
}

function OutputEntry({ entry }: { entry: StreamEvent }) {
  switch (entry.type) {
    case "text":
      return (
        <span className="text-gray-300 whitespace-pre-wrap">
          {entry.content}
        </span>
      );
    case "user_message":
      return (
        <div className="text-indigo-400 mt-2 mb-2 pt-2 border-t border-gray-800">
          &gt; {entry.content}
        </div>
      );
    case "tool_start":
      return (
        <div className="text-indigo-400 mt-2 mb-1">
          \u25B6 {entry.tool}
        </div>
      );
    case "tool_input":
      return (
        <span className="text-gray-500 whitespace-pre-wrap">
          {entry.input}
        </span>
      );
    case "tool_end":
      return <div className="text-gray-600 mb-1">\u2500\u2500\u2500</div>;
    case "turn_complete":
      return <div className="border-t border-gray-800 my-2" />;
    default:
      return null;
  }
}
