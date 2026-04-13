// ── Messages ──

export type MessageType =
  | "text"
  | "winkd"    // 💥 Winkd — shakes recipient window
  | "nudge"    // 🫸 Nudge — lightweight notification
  | "wink"     // ✨ Animated Wink sticker
  | "emoticon" // Custom emoticon
  | "system";  // System notices (contact added, key exchange, etc.)

export interface BaseMessage {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  /** ISO 8601 */
  sentAt: string;
  /** True once delivered to recipient device */
  delivered: boolean;
  /** True once recipient has read it */
  read: boolean;
}

export interface TextMessage extends BaseMessage {
  type: "text";
  /** Plaintext body (decrypted locally — never stored server-side in plaintext) */
  body: string;
}

export interface WinkdMessage extends BaseMessage {
  type: "winkd";
}

export interface NudgeMessage extends BaseMessage {
  type: "nudge";
}

export interface WinkMessage extends BaseMessage {
  type: "wink";
  /** Wink pack ID */
  packId: string;
  /** Individual animation ID within the pack */
  animationId: string;
}

export interface SystemMessage extends BaseMessage {
  type: "system";
  body: string;
}

export type Message =
  | TextMessage
  | WinkdMessage
  | NudgeMessage
  | WinkMessage
  | SystemMessage;
