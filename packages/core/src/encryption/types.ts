// ── Encryption Types ──

/** Raw key bytes, base64-encoded for storage/transport */
export type KeyBytes = string;

/**
 * P-256 identity key pair.
 * The same JWK (with key_ops stripped) can be imported as ECDH for key agreement
 * or as ECDSA for signing/verification — both are valid uses of the same P-256 scalar.
 */
export interface IdentityKeyPair {
  /** Uncompressed P-256 public key, raw bytes, base64 (65 bytes) */
  publicKey: KeyBytes;
  /** P-256 private key as JWK JSON string (key_ops omitted for dual-use) */
  privateKey: KeyBytes;
}

export interface PreKey {
  id: number;
  publicKey: KeyBytes;
  privateKey: KeyBytes;
}

export interface SignedPreKey extends PreKey {
  /** ECDSA-P256-SHA256 signature over the pre-key's public key bytes, base64 */
  signature: KeyBytes;
}

/** Bundle uploaded to server so contacts can initiate X3DH */
export interface PreKeyBundle {
  registrationId: number;
  deviceId: number;
  /**
   * Uploader's P-256 identity public key (raw bytes, base64).
   * Used for both X3DH DH operations AND verifying the signedPreKey signature.
   */
  identityKey: KeyBytes;
  signedPreKey: Omit<SignedPreKey, "privateKey">;
  /** One-time pre-key (optional, consumed on use) */
  oneTimePreKey?: Omit<PreKey, "privateKey">;
}

/** An encrypted message envelope as it travels over the wire */
export interface EncryptedEnvelope {
  /**
   * Signal message type:
   *   1 = PreKeySignalMessage (first message, carries X3DH params)
   *   2 = SignalMessage (subsequent messages, Double Ratchet only)
   */
  type: 1 | 2;
  /**
   * Base64-encoded JSON payload.
   * Type 1: PreKeyWireMessage  (includes identity/ephemeral keys for X3DH)
   * Type 2: WireMessage        (ratchet header + ciphertext only)
   */
  ciphertext: KeyBytes;
  /** Sender's registration ID */
  registrationId: number;
}

// ── Double Ratchet session state ───────────────────────────────────────────
// Persisted per peer in the KeyStore. All keys are hex (32-byte) or JWK/base64.

export interface RatchetSession {
  /** Current root key (hex, 32 bytes) */
  rootKey: string;
  /** Sending chain key (hex) — null until first send */
  sendChainKey: string | null;
  /** Receiving chain key (hex) — null until first receive */
  recvChainKey: string | null;
  /** Number of messages sent on current sending chain */
  sendCount: number;
  /** Number of messages received on current receiving chain */
  recvCount: number;
  /** sendCount at the time of the last DH ratchet step */
  prevSendCount: number;
  /** Our current DH ratchet public key (base64 raw) */
  ourRatchetPublic: string;
  /** Our current DH ratchet private key (JWK) */
  ourRatchetPrivate: string;
  /** Their last seen DH ratchet public key (base64 raw), null until first message */
  theirRatchetPublic: string | null;
  /**
   * Skipped message keys saved for out-of-order delivery.
   * Key = `${ratchetPublicBase64}:${messageNumber}`, value = hex message key.
   */
  skipped: Record<string, string>;
  /** Whether we are the X3DH initiator (affects type-1 message generation) */
  isInitiator: boolean;
  /**
   * Cached X3DH parameters included in the type-1 PreKey message.
   * Present only on the initiator side, cleared after the first message is sent.
   */
  pendingPreKeyMsg?: {
    identityKey: string;    // Our identity public key (base64)
    ephemeralKey: string;   // Our ephemeral key from X3DH (base64)
    spkId: number;          // Signed pre-key ID used
    opkId: number | null;   // One-time pre-key ID used (null if none)
  };
}
