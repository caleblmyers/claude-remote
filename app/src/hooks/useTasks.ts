import { useState, useEffect, useCallback, useRef } from "react";
import type { Task, WsServerEvent, StreamEvent } from "../lib/types";
import { api } from "../lib/api";

interface UseTasksReturn {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useTasks(): UseTasksReturn {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.tasks.list();
      setTasks(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tasks, loading, error, refresh };
}

/** Handle a WebSocket event and update a task list in place. */
export function applyWsEvent(
  tasks: Task[],
  event: WsServerEvent
): Task[] {
  switch (event.type) {
    case "task:created":
      // Add new task if not already present
      if (tasks.find((t) => t.id === event.taskId)) return tasks;
      return [
        {
          id: event.taskId,
          repo: event.repo,
          prompt: event.prompt,
          status: event.status,
          trustLevel: { autoApprove: [], alwaysAsk: [], deny: [] },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        ...tasks,
      ];

    case "task:status_change":
      if (!event.taskId || !event.newStatus) return tasks;
      return tasks.map((t) =>
        t.id === event.taskId
          ? { ...t, status: event.newStatus!, updatedAt: new Date().toISOString() }
          : t
      );

    case "task:complete":
      return tasks.map((t) =>
        t.id === event.taskId
          ? {
              ...t,
              status: "completed" as const,
              summary: event.summary,
              filesChanged: event.filesChanged,
              updatedAt: new Date().toISOString(),
            }
          : t
      );

    case "task:error":
      return tasks.map((t) =>
        t.id === event.taskId
          ? {
              ...t,
              status: "failed" as const,
              error: event.error,
              updatedAt: new Date().toISOString(),
            }
          : t
      );

    default:
      return tasks;
  }
}

/** Accumulate stream events for a specific task. */
export interface TaskOutput {
  entries: StreamEvent[];
}

export function useTaskOutput(taskId: string | undefined) {
  const [entries, setEntries] = useState<StreamEvent[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(!!taskId);
  const savedCountRef = useRef(0);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  // Load persisted events on mount
  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    setLoadingSaved(true);
    api.tasks.events(taskId).then((saved) => {
      if (cancelled) return;
      const parsed: StreamEvent[] = saved.map((e) => JSON.parse(e.data));
      savedCountRef.current = parsed.length;
      setEntries(parsed);
      setLoadingSaved(false);
    }).catch(() => {
      if (!cancelled) setLoadingSaved(false);
    });
    return () => { cancelled = true; };
  }, [taskId]);

  const handleEvent = useCallback(
    (event: WsServerEvent) => {
      if (!taskId) return;
      if (event.type === "task:stream" && event.taskId === taskId) {
        setEntries((prev) => {
          // Deduplicate: skip if this matches a saved event we already have
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
    },
    [taskId]
  );

  const clear = useCallback(() => setEntries([]), []);

  return { entries, handleEvent, clear, loadingSaved };
}
