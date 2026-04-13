// ── Encryption Types ──

/** Raw key bytes, base64-encoded for storage/transport */
export type KeyBytes = string;

export interface IdentityKeyPair {
  publicKey: KeyBytes;
  privateKey: KeyBytes;
}

export interface PreKey {
  id: number;
  publicKey: KeyBytes;
  privateKey: KeyBytes;
}

export interface SignedPreKey extends PreKey {
  signature: KeyBytes;
}

/** Bundle uploaded to server so contacts can initiate X3DH */
export interface PreKeyBundle {
  registrationId: number;
  deviceId: number;
  identityKey: KeyBytes;
  signedPreKey: Omit<SignedPreKey, "privateKey">;
  /** One-time pre-key (optional, consumed on use) */
  oneTimePreKey?: Omit<PreKey, "privateKey">;
}

/** An encrypted message envelope as it travels over the wire */
export interface EncryptedEnvelope {
  /** Signal message type: 1 = PreKeySignalMessage, 2 = SignalMessage */
  type: 1 | 2;
  /** Base64-encoded ciphertext */
  ciphertext: KeyBytes;
  /** Sender's registration ID */
  registrationId: number;
}
