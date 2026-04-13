// ── Encryption Session Manager ──
// Wraps libsignal session cipher operations.
// Stub — real libsignal wiring in Phase 1.

import type { EncryptedEnvelope, PreKeyBundle } from "./types";
import type { KeyStore } from "./keystore";

export class SignalSessionManager {
  constructor(private readonly store: KeyStore) {}

  /**
   * Initiate a session with a new contact using their PreKeyBundle (X3DH).
   * Called once when a contact request is accepted.
   */
  async initSessionFromBundle(
    peerId: string,
    bundle: PreKeyBundle,
  ): Promise<void> {
    // TODO Phase 1: call libsignal SessionBuilder.processPreKeyBundle()
    console.warn(`[SignalSessionManager] initSessionFromBundle stub for ${peerId}`, bundle);
  }

  /**
   * Encrypt a plaintext string for a peer.
   * Returns an EncryptedEnvelope ready for transmission.
   */
  async encrypt(peerId: string, plaintext: string): Promise<EncryptedEnvelope> {
    // TODO Phase 1: call libsignal SessionCipher.encrypt()
    // Stub: base64 the plaintext so it round-trips in dev
    const ciphertext = btoa(unescape(encodeURIComponent(plaintext)));
    return { type: 2, ciphertext, registrationId: 0 };
  }

  /**
   * Decrypt an incoming EncryptedEnvelope from a peer.
   * Returns the plaintext string.
   */
  async decrypt(peerId: string, envelope: EncryptedEnvelope): Promise<string> {
    // TODO Phase 1: call libsignal SessionCipher.decrypt()
    // Stub: reverse the dev encoding above
    try {
      return decodeURIComponent(escape(atob(envelope.ciphertext)));
    } catch {
      throw new Error(`[SignalSessionManager] Failed to decrypt message from ${peerId}`);
    }
  }
}
