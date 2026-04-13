// ── Key Store ──
// Persists identity keys, pre-keys, and session records.
// Uses IndexedDB on web/PWA; Tauri's secure storage on desktop;
// react-native-keychain on mobile.
//
// This module defines the interface — platform adapters implement it.

import type { IdentityKeyPair, PreKey, SignedPreKey } from "./types";

export interface KeyStore {
  /** Load the device's long-term identity key pair */
  getIdentityKeyPair(): Promise<IdentityKeyPair | null>;

  /** Persist a freshly generated identity key pair */
  saveIdentityKeyPair(pair: IdentityKeyPair): Promise<void>;

  /** Registration ID (random 14-bit number, stable per device) */
  getLocalRegistrationId(): Promise<number | null>;
  saveLocalRegistrationId(id: number): Promise<void>;

  /** One-time pre-keys (consumed on X3DH) */
  loadPreKey(id: number): Promise<PreKey | null>;
  storePreKey(key: PreKey): Promise<void>;
  removePreKey(id: number): Promise<void>;

  /** Signed pre-key (rotated periodically) */
  loadSignedPreKey(id: number): Promise<SignedPreKey | null>;
  storeSignedPreKey(key: SignedPreKey): Promise<void>;
}

// ── In-Memory KeyStore (development / testing only) ──

export class InMemoryKeyStore implements KeyStore {
  private identityKeyPair: IdentityKeyPair | null = null;
  private registrationId: number | null = null;
  private preKeys = new Map<number, PreKey>();
  private signedPreKeys = new Map<number, SignedPreKey>();

  async getIdentityKeyPair() { return this.identityKeyPair; }
  async saveIdentityKeyPair(pair: IdentityKeyPair) { this.identityKeyPair = pair; }
  async getLocalRegistrationId() { return this.registrationId; }
  async saveLocalRegistrationId(id: number) { this.registrationId = id; }
  async loadPreKey(id: number) { return this.preKeys.get(id) ?? null; }
  async storePreKey(key: PreKey) { this.preKeys.set(key.id, key); }
  async removePreKey(id: number) { this.preKeys.delete(id); }
  async loadSignedPreKey(id: number) { return this.signedPreKeys.get(id) ?? null; }
  async storeSignedPreKey(key: SignedPreKey) { this.signedPreKeys.set(key.id, key); }
}
