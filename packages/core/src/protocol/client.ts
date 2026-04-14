// ── Winkd Protocol Client ──
// Manages the WebSocket connection to the Winkd server.
//
// Authentication protocol:
//   1. Connect to /ws (NO token in the URL)
//   2. Immediately send { "type": "auth", "token": "<session-token>" }
//   3. Wait for { "type": "auth_ok" } before dispatching any other messages
//   4. On close code 4001, the session is invalid — caller should sign out

import type {
  ClientCommand,
  ClientCommandType,
  ServerEvent,
  ServerEventType,
} from "@winkd/types";

type EventHandler<T = unknown> = (payload: T) => void;

export class WinkdClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<ServerEventType, Set<EventHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1_000;
  private authenticated = false;
  /** Called when the server returns close code 4001 (session invalid). */
  onAuthFailure: (() => void) | null = null;

  constructor(
    private readonly serverUrl: string,
    private readonly sessionToken: string,
  ) {}

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    // Token is NOT in the URL — it is sent as the first WebSocket message.
    this.ws = new WebSocket(this.serverUrl);
    this.authenticated = false;

    this.ws.onopen = () => {
      this.reconnectDelay = 1_000;
      this.ws!.send(JSON.stringify({ type: "auth", token: this.sessionToken }));
    };

    this.ws.onmessage = (event: MessageEvent<string>) => {
      try {
        const envelope = JSON.parse(event.data) as ServerEvent & { type?: string };

        // Must receive auth_ok before routing any other events.
        if (!this.authenticated) {
          if (envelope.type === "auth_ok") {
            this.authenticated = true;
          }
          return;
        }

        this.dispatch(envelope);
      } catch {
        console.error("[WinkdClient] Failed to parse server event", event.data);
      }
    };

    this.ws.onclose = (e: CloseEvent) => {
      this.authenticated = false;
      if (e.code === 4001) {
        console.warn("[WinkdClient] Session rejected by server (4001) — signing out");
        this.onAuthFailure?.();
        return; // Do not reconnect on auth failure.
      }
      console.warn("[WinkdClient] Disconnected — reconnecting in", this.reconnectDelay, "ms");
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error("[WinkdClient] WebSocket error", err);
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.authenticated = false;
  }

  send<T>(command: ClientCommandType, payload: T): void {
    if (!this.authenticated || this.ws?.readyState !== WebSocket.OPEN) {
      console.warn("[WinkdClient] send() called while not authenticated");
      return;
    }
    const msg: ClientCommand<T> = { command, payload };
    this.ws.send(JSON.stringify(msg));
  }

  on<T>(event: ServerEventType, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler as EventHandler);
    return () => this.handlers.get(event)?.delete(handler as EventHandler);
  }

  private dispatch(envelope: ServerEvent): void {
    const set = this.handlers.get(envelope.event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(envelope.payload);
      } catch (err) {
        console.error(`[WinkdClient] Handler error for event "${envelope.event}"`, err);
      }
    }
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
      this.connect();
    }, this.reconnectDelay);
  }
}
