// ── Encryption ──
// Signal Protocol implementation using WebCrypto (SubtleCrypto) primitives.
//
// Key concepts:
//   X3DH          — Extended Triple Diffie-Hellman for initial key agreement
//   Double Ratchet — Forward secrecy + break-in recovery for ongoing sessions
//   PreKeys        — One-time keys uploaded to server, consumed on contact add
//   Safety numbers — Out-of-band identity verification (60-digit code)
//
// Quick-start for a new user device:
//   1. generateIdentityKeyPair()   → store in IndexedDbKeyStore
//   2. newRegistrationId()         → store in IndexedDbKeyStore
//   3. generateSignedPreKeyPair()  → upload public parts + signature to server
//   4. generatePreKeyPair() × N    → upload public parts to server (one-time keys)
//
// Sending the first message to a contact:
//   5. Fetch their PreKeyBundle from the server
//   6. SignalSessionManager.initSessionFromBundle(peerId, bundle)
//   7. SignalSessionManager.encrypt(peerId, plaintext) → EncryptedEnvelope (type 1)
//
// Receiving the first message:
//   8. SignalSessionManager.decrypt(peerId, envelope) → plaintext
//      (session is initialised automatically from the type-1 envelope)

export * from "./types";
export * from "./keystore";
export * from "./session";
export * from "./crypto";
