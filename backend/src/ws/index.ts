import { WebSocket, WebSocketServer } from "ws";
import { IncomingMessage } from "http";
import { Server } from "http";
import * as db from "../db";
import { stopTask, replyToTask } from "../agent";
import { verifyToken } from "../auth";
import url from "url";

export type WsEventType =
  | "task:created"
  | "task:progress"
  | "task:stream"
  | "task:permission"
  | "task:complete"
  | "task:error"
  | "task:status_change";

export type WsClientEventType =
  | "task:approve"
  | "task:deny"
  | "task:reply"
  | "task:stop";

export interface WsMessage {
  type: WsEventType | WsClientEventType;
  [key: string]: unknown;
}

// Active WebSocket connections keyed by a simple incrementing id
const clients = new Map<number, WebSocket>();
let nextClientId = 1;

export function createWsServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    // Validate auth token from query string
    const parsed = url.parse(req.url ?? "", true);
    const token = parsed.query.token as string | undefined;

    if (!token || !verifyToken(token)) {
      ws.close(4001, "Unauthorized");
      return;
    }

    const clientId = nextClientId++;
    clients.set(clientId, ws);
    console.log(`WebSocket client connected (id=${clientId})`);

    ws.on("message", (raw) => {
      try {
        const msg: WsMessage = JSON.parse(raw.toString());
        handleClientMessage(ws, msg);
      } catch {
        console.warn("Invalid WS message received");
      }
    });

    ws.on("close", () => {
      clients.delete(clientId);
      console.log(`WebSocket client disconnected (id=${clientId})`);
    });

    ws.on("error", (err) => {
      console.error(`WebSocket error (id=${clientId}):`, err.message);
    });

    // Send a welcome message so the client knows it's connected
    safeSend(ws, { type: "task:status_change", connected: true });
  });

  return wss;
}

function handleClientMessage(_ws: WebSocket, msg: WsMessage): void {
  console.log("WS message from client:", msg.type);

  switch (msg.type) {
    case "task:approve": {
      const { taskId, requestId } = msg as {
        taskId: string;
        requestId: string;
        type: string;
      };
      if (!requestId) break;
      const perm = db.getPermissionRequest(requestId);
      if (perm && perm.taskId === taskId && perm.status === "pending") {
        db.resolvePermissionRequest(requestId, "approved");
      }
      break;
    }

    case "task:deny": {
      const { taskId, requestId } = msg as {
        taskId: string;
        requestId: string;
        type: string;
      };
      if (!requestId) break;
      const perm = db.getPermissionRequest(requestId);
      if (perm && perm.taskId === taskId && perm.status === "pending") {
        db.resolvePermissionRequest(requestId, "denied");
      }
      break;
    }

    case "task:reply": {
      const { taskId, message } = msg as {
        taskId: string;
        message: string;
        type: string;
      };
      if (!taskId || !message) break;
      replyToTask(taskId, message).catch((err) => {
        console.error(`Reply to task ${taskId} failed:`, err.message);
        broadcast({
          type: "task:error",
          taskId,
          error: `Reply failed: ${err.message}`,
        });
      });
      break;
    }

    case "task:stop": {
      const { taskId } = msg as { taskId: string; type: string };
      if (!taskId) break;
      const stopped = stopTask(taskId);
      if (!stopped) {
        // Task not running via agent, just update DB
        const task = db.getTask(taskId);
        if (task && !["completed", "failed", "stopped"].includes(task.status)) {
          db.updateTask(taskId, { status: "stopped" });
          broadcast({
            type: "task:status_change",
            taskId,
            oldStatus: task.status,
            newStatus: "stopped",
          });
        }
      }
      break;
    }
  }
}

/** Broadcast a message to all connected clients. */
export function broadcast(event: WsMessage): void {
  const data = JSON.stringify(event);
  for (const ws of clients.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

/** Send to a single client safely. */
export function safeSend(ws: WebSocket, event: WsMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}
