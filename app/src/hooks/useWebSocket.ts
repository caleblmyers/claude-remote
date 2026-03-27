import { useEffect, useRef, useCallback, useState } from "react";
import { api } from "../lib/api";
import type { WsServerEvent } from "../lib/types";

declare const __API_PORT__: string;

function getWsBaseUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname;
  // In dev, Vite runs on a different port than the backend
  const devPorts = ["5173", "5174", "5199"];
  const backendPort = typeof __API_PORT__ !== "undefined" ? __API_PORT__ : "3000";
  const port = devPorts.includes(window.location.port) ? backendPort : window.location.port;
  return `${proto}//${host}:${port}`;
}

async function getWsUrl(): Promise<string> {
  // Fetch a short-lived, single-use ticket from the backend to authenticate
  // the WebSocket connection. This avoids putting long-lived JWTs in the
  // query string where they could be logged or leaked via Referer headers.
  const { ticket } = await api.auth.wsTicket();
  return `${getWsBaseUrl()}?ticket=${encodeURIComponent(ticket)}`;
}

export type WsStatus = "connecting" | "connected" | "disconnected" | "error";

interface UseWebSocketReturn {
  status: WsStatus;
  send: (event: Record<string, unknown>) => void;
  lastEvent: WsServerEvent | null;
}

const STALE_TIMEOUT_MS = 45_000;

export function useWebSocket(
  onEvent?: (event: WsServerEvent) => void
): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);
  const pausedRef = useRef(false);
  const [status, setStatus] = useState<WsStatus>("connecting");
  const [lastEvent, setLastEvent] = useState<WsServerEvent | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const resetStaleTimer = useCallback(() => {
    if (staleTimer.current) clearTimeout(staleTimer.current);
    staleTimer.current = setTimeout(() => {
      // No message received for 45s — connection is stale
      if (wsRef.current) {
        wsRef.current.close();
      }
    }, STALE_TIMEOUT_MS);
  }, []);

  const cancelReconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  }, []);

  // Use a ref for connect so initWs can reference it without circular useCallback deps
  const connectRef = useRef<() => void>(() => {});

  const initWs = useCallback((ws: WebSocket) => {
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      reconnectDelay.current = 1000; // reset backoff
      resetStaleTimer();
    };

    ws.onmessage = (e) => {
      resetStaleTimer();
      try {
        const event = JSON.parse(e.data as string) as WsServerEvent;
        setLastEvent(event);
        onEventRef.current?.(event);
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = (e) => {
      setStatus("disconnected");
      wsRef.current = null;
      if (staleTimer.current) clearTimeout(staleTimer.current);
      // Don't reconnect on auth failure
      if (e.code === 4001) return;
      // Don't schedule reconnect if paused
      if (pausedRef.current) return;
      // Exponential backoff: 1s, 2s, 4s, 8s, max 15s
      const delay = reconnectDelay.current;
      reconnectDelay.current = Math.min(delay * 2, 15000);
      reconnectTimer.current = setTimeout(connectRef.current, delay);
    };

    ws.onerror = () => {
      setStatus("error");
      ws.close();
    };
  }, [resetStaleTimer]);

  const connect = useCallback(() => {
    // Don't connect without a token
    if (!localStorage.getItem("claude-remote-token")) {
      setStatus("disconnected");
      return;
    }

    // Don't connect while paused (screen off or offline)
    if (pausedRef.current) return;

    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");

    // Fetch a single-use ticket, then open the WebSocket
    getWsUrl()
      .then((wsUrl) => {
        // Re-check state after async ticket fetch
        if (pausedRef.current || wsRef.current?.readyState === WebSocket.OPEN) return;
        const ws = new WebSocket(wsUrl);
        initWs(ws);
      })
      .catch(() => {
        setStatus("error");
        // Schedule reconnect on ticket fetch failure
        const delay = reconnectDelay.current;
        reconnectDelay.current = Math.min(delay * 2, 15000);
        reconnectTimer.current = setTimeout(connectRef.current, delay);
      });
  }, [resetStaleTimer, initWs]);

  // Keep ref in sync
  connectRef.current = connect;

  // Visibility change: pause reconnects when screen is off, reconnect immediately when on
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        pausedRef.current = true;
        cancelReconnect();
      } else {
        pausedRef.current = false;
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          reconnectDelay.current = 1000;
          connect();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [connect, cancelReconnect]);

  // Online/offline: pause when offline, reconnect when online
  useEffect(() => {
    const handleOnline = () => {
      pausedRef.current = false;
      reconnectDelay.current = 1000;
      connect();
    };

    const handleOffline = () => {
      pausedRef.current = true;
      cancelReconnect();
      setStatus("disconnected");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [connect, cancelReconnect]);

  useEffect(() => {
    connect();
    return () => {
      cancelReconnect();
      if (staleTimer.current) clearTimeout(staleTimer.current);
      wsRef.current?.close();
    };
  }, [connect, cancelReconnect]);

  const send = useCallback((event: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event));
    }
  }, []);

  return { status, send, lastEvent };
}
