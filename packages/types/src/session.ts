// ── Conversation Session ──

export interface Conversation {
  id: string;
  /** The other participant's Winkd ID */
  peerId: string;
  /** ISO 8601 timestamp of most recent message */
  lastMessageAt: string | null;
  /** Unread count */
  unreadCount: number;
}

// ── WebSocket Protocol Envelope ──

export type ServerEventType =
  | "message"
  | "presence_update"
  | "contact_request"
  | "contact_accepted"
  | "winkd_received"
  | "nudge_received"
  | "typing_start"
  | "typing_stop"
  | "delivery_receipt"
  | "read_receipt";

export interface ServerEvent<T = unknown> {
  event: ServerEventType;
  payload: T;
}

export type ClientCommandType =
  | "send_message"
  | "set_status"
  | "set_mood"
  | "add_contact"
  | "accept_contact"
  | "block_contact"
  | "send_winkd"
  | "send_nudge"
  | "send_wink"
  | "typing_start"
  | "typing_stop";

export interface ClientCommand<T = unknown> {
  command: ClientCommandType;
  payload: T;
}
