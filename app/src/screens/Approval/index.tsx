import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import type { TaskWithPermissions } from "../../lib/api";
import type { PermissionRequest } from "../../lib/types";

export default function ApprovalScreen() {
  const navigate = useNavigate();
  const { taskId } = useParams<{ taskId: string }>();
  const [task, setTask] = useState<TaskWithPermissions | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!taskId) return;
    api.tasks.get(taskId).then(setTask).catch(console.error);
  }, [taskId]);

  const handleApprove = async (perm: PermissionRequest) => {
    if (!taskId || resolving) return;
    setResolving(true);
    try {
      await api.tasks.approve(taskId, perm.id);
      // Navigate to task detail after approval
      navigate(`/tasks/${taskId}`, { replace: true });
    } catch (err) {
      console.error(err);
      setResolving(false);
    }
  };

  const handleDeny = async (perm: PermissionRequest) => {
    if (!taskId || resolving) return;
    setResolving(true);
    try {
      await api.tasks.deny(taskId, perm.id);
      navigate(`/tasks/${taskId}`, { replace: true });
    } catch (err) {
      console.error(err);
      setResolving(false);
    }
  };

  const pendingPerms = task?.pendingPermissions?.filter(
    (p) => p.status === "pending"
  );
  const perm = pendingPerms?.[0];

  return (
    <div className="flex flex-col min-h-dvh bg-gray-950 text-gray-100">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center justify-center w-11 h-11 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
          aria-label="Back"
        >
          \u25C0
        </button>
        <h1 className="text-lg font-semibold">Permission Request</h1>
      </header>

      <main className="flex-1 px-4 py-6 flex flex-col gap-4">
        {!task ? (
          <p className="text-sm text-gray-500 text-center mt-8">Loading...</p>
        ) : !perm ? (
          <div className="text-center mt-8">
            <p className="text-sm text-gray-500">No pending permissions.</p>
            <button
              onClick={() => navigate(`/tasks/${taskId}`)}
              className="text-sm text-indigo-400 mt-2 hover:underline"
            >
              View task detail
            </button>
          </div>
        ) : (
          <>
            {/* Context */}
            <div className="rounded-xl border border-amber-800 bg-amber-950/30 px-4 py-3">
              <p className="text-sm text-amber-400 font-medium">
                \u26A0 Approval needed
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {task.repo} &middot; {task.prompt.slice(0, 50)}
              </p>
            </div>

            {/* Tool info */}
            <div className="rounded-xl border border-gray-800 p-4">
              <p className="text-sm text-gray-400 mb-2">
                Claude wants to run:
              </p>
              <div className="bg-gray-900 rounded-lg px-3 py-2 font-mono text-sm text-gray-300 overflow-x-auto">
                {formatToolInput(perm.tool, perm.input)}
              </div>
            </div>

            {/* Reasoning */}
            {perm.reasoning && (
              <div className="rounded-xl border border-gray-800 p-4">
                <p className="text-sm text-gray-400 mb-1">Why:</p>
                <p className="text-sm text-gray-300">{perm.reasoning}</p>
              </div>
            )}
          </>
        )}
      </main>

      {/* Approve / Deny */}
      {perm && (
        <footer className="px-4 py-6 border-t border-gray-800 flex gap-3">
          <button
            onClick={() => handleDeny(perm)}
            disabled={resolving}
            className="flex-1 h-14 rounded-xl border border-red-800 text-red-400 hover:bg-red-950/40 font-medium transition-colors disabled:opacity-40"
          >
            \u2717 Deny
          </button>
          <button
            onClick={() => handleApprove(perm)}
            disabled={resolving}
            className="flex-1 h-14 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-medium transition-colors disabled:opacity-40"
          >
            \u2713 Approve
          </button>
        </footer>
      )}
    </div>
  );
}

function formatToolInput(tool: string, input: Record<string, unknown>): string {
  if (tool === "Bash" && input.command) return `$ ${input.command}`;
  if ((tool === "Edit" || tool === "Write" || tool === "Read") && input.file_path)
    return `${tool}: ${input.file_path}`;
  return `${tool}: ${JSON.stringify(input, null, 2)}`;
}
