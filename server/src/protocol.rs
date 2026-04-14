// ── WebSocket Protocol Types ──
// Server-side mirror of the TypeScript types in @winkd/types.

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum ServerEventType {
    Message,
    PresenceUpdate,
    ContactRequest,
    ContactAccepted,
    WinkdReceived,
    NudgeReceived,
    TypingStart,
    TypingStop,
    DeliveryReceipt,
    ReadReceipt,
}

#[derive(Debug, Serialize, Clone)]
pub struct ServerEvent<T: Serialize> {
    pub event: ServerEventType,
    pub payload: T,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClientCommandType {
    SendMessage,
    SetStatus,
    SetMood,
    SetDisplayName,
    SetAvatar,
    SetProfileStyle,
    AddContact,
    AcceptContact,
    BlockContact,
    SendWinkd,
    SendNudge,
    SendWink,
    TypingStart,
    TypingStop,
}

#[derive(Debug, Deserialize)]
pub struct ClientCommand {
    pub command: ClientCommandType,
    pub payload: serde_json::Value,
}

// ── Message Envelope (encrypted blob relay) ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessageEnvelope {
    pub id: String,
    pub conversation_id: String,
    pub sender_id: String,
    pub recipient_id: String,
    /// Signal Protocol message type: 1 = PreKeySignalMessage, 2 = SignalMessage
    pub signal_type: u8,
    /// Base64-encoded ciphertext — server never decrypts this
    pub ciphertext: String,
    pub sent_at: chrono::DateTime<chrono::Utc>,
}
