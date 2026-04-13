// ── Encryption ──
// Signal Protocol implementation via @signalapp/libsignal-client.
//
// Phase 0 provides the interface contracts and stub implementations.
// Real libsignal integration happens in Phase 1 when the server is live
// and key exchange (X3DH) can be tested end-to-end.
//
// Key concepts:
//   X3DH  — Extended Triple Diffie-Hellman for initial key agreement
//   Double Ratchet — forward secrecy for ongoing sessions
//   PreKeys — one-time keys uploaded to server, consumed on contact add

export * from "./types";
export * from "./keystore";
export * from "./session";
