import { v4 as uuidv4 } from "uuid";

interface WsTicket {
  createdAt: number;
}

const TICKET_TTL_MS = 30_000; // 30 seconds

// In-memory store for single-use WebSocket tickets
const tickets = new Map<string, WsTicket>();

/**
 * Create a short-lived, single-use ticket for WebSocket authentication.
 * This avoids putting long-lived JWTs in the query string.
 */
export function createWsTicket(): string {
  const ticket = uuidv4();
  tickets.set(ticket, { createdAt: Date.now() });

  // Auto-cleanup after TTL
  setTimeout(() => {
    tickets.delete(ticket);
  }, TICKET_TTL_MS);

  return ticket;
}

/**
 * Validate and consume a WebSocket ticket. Returns true if valid.
 * Tickets are single-use and expire after 30 seconds.
 */
export function consumeWsTicket(ticket: string): boolean {
  const entry = tickets.get(ticket);
  if (!entry) return false;

  // Delete immediately — single-use
  tickets.delete(ticket);

  // Check TTL
  if (Date.now() - entry.createdAt > TICKET_TTL_MS) {
    return false;
  }

  return true;
}
