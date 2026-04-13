// ── Winkd Protocol Client ──

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
  private reconnectDelay = 1000;

  constructor(
    private readonly serverUrl: string,
    private readonly sessionToken: string,
  ) {}

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const url = new URL(this.serverUrl);
    url.searchParams.set("token", this.sessionToken);

    this.ws = new WebSocket(url.toString());

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      console.log("[WinkdClient] Connected");
    };

    this.ws.onmessage = (event: MessageEvent<string>) => {
      try {
        const envelope = JSON.parse(event.data) as ServerEvent;
        this.dispatch(envelope);
      } catch {
        console.error("[WinkdClient] Failed to parse server event", event.data);
      }
    };

    this.ws.onclose = () => {
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
  }

  send<T>(command: ClientCommandType, payload: T): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.warn("[WinkdClient] send() called while not connected");
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
