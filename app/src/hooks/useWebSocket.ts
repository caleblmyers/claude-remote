import { useEffect, useRef, useCallback, useState } from "react";
import type { WsServerEvent } from "../lib/types";

function getWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname;
  // In dev, Vite runs on a different port than the backend
  const devPorts = ["5173", "5174"];
  const port = devPorts.includes(window.location.port) ? "3000" : window.location.port;
  const token = localStorage.getItem("claude-remote-token") ?? "";
  return `${proto}//${host}:${port}?token=${encodeURIComponent(token)}`;
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

  const connect = useCallback(() => {
    // Don't connect without a token
    if (!localStorage.getItem("claude-remote-token")) {
      setStatus("disconnected");
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");
    const ws = new WebSocket(getWsUrl());
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
      // Exponential backoff: 1s, 2s, 4s, 8s, max 15s
      const delay = reconnectDelay.current;
      reconnectDelay.current = Math.min(delay * 2, 15000);
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      setStatus("error");
      ws.close();
    };
  }, [resetStaleTimer]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (staleTimer.current) clearTimeout(staleTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((event: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event));
    }
  }, []);

  return { status, send, lastEvent };
}
