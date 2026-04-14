// ── Key Store ──
// Persists identity keys, pre-keys, signed pre-keys, and Double Ratchet sessions.
//
// Platform implementations:
//   Web / PWA  → IndexedDbKeyStore  (this file)
//   Desktop    → Tauri secure storage  (Phase 2)
//   Mobile     → react-native-keychain (Phase 3)

import type { IdentityKeyPair, PreKey, RatchetSession, SignedPreKey } from "./types";

// ── Interface ─────────────────────────────────────────────────────────────────

export interface KeyStore {
  // ── Identity ──────────────────────────────────────────────────────────────
  getIdentityKeyPair(): Promise<IdentityKeyPair | null>;
  saveIdentityKeyPair(pair: IdentityKeyPair): Promise<void>;

  // ── Registration ID ───────────────────────────────────────────────────────
  getLocalRegistrationId(): Promise<number | null>;
  saveLocalRegistrationId(id: number): Promise<void>;

  // ── One-time pre-keys (consumed on X3DH) ─────────────────────────────────
  loadPreKey(id: number): Promise<PreKey | null>;
  storePreKey(key: PreKey): Promise<void>;
  removePreKey(id: number): Promise<void>;

  // ── Signed pre-key (rotated periodically) ────────────────────────────────
  loadSignedPreKey(id: number): Promise<SignedPreKey | null>;
  storeSignedPreKey(key: SignedPreKey): Promise<void>;
  removeSignedPreKey(id: number): Promise<void>;

  // ── Double Ratchet sessions ───────────────────────────────────────────────
  loadSession(peerId: string): Promise<RatchetSession | null>;
  storeSession(peerId: string, session: RatchetSession): Promise<void>;
  deleteSession(peerId: string): Promise<void>;
}

// ── IndexedDB implementation (Web / PWA) ─────────────────────────────────────

const DB_NAME = "winkd_keys";
const DB_VERSION = 1;
const STORE_IDENTITY = "identity_keys";
const STORE_REG_ID = "registration_id";
const STORE_PRE_KEYS = "pre_keys";
const STORE_SIGNED_PRE_KEYS = "signed_pre_keys";
const STORE_SESSIONS = "sessions";

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of [
        STORE_IDENTITY,
        STORE_REG_ID,
        STORE_PRE_KEYS,
        STORE_SIGNED_PRE_KEYS,
        STORE_SESSIONS,
      ]) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name);
        }
      }
    };
    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, "readonly").objectStore(storeName).get(key);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(storeName: string, key: IDBValidKey, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * IndexedDB-backed key store for the Web / PWA platform.
 * Keys are stored as plain JSON objects — they never leave the browser's
 * origin-scoped IndexedDB storage.
 */
export class IndexedDbKeyStore implements KeyStore {
  async getIdentityKeyPair(): Promise<IdentityKeyPair | null> {
    return idbGet<IdentityKeyPair>(STORE_IDENTITY, "ik");
  }
  async saveIdentityKeyPair(pair: IdentityKeyPair): Promise<void> {
    return idbPut(STORE_IDENTITY, "ik", pair);
  }

  async getLocalRegistrationId(): Promise<number | null> {
    return idbGet<number>(STORE_REG_ID, "rid");
  }
  async saveLocalRegistrationId(id: number): Promise<void> {
    return idbPut(STORE_REG_ID, "rid", id);
  }

  async loadPreKey(id: number): Promise<PreKey | null> {
    return idbGet<PreKey>(STORE_PRE_KEYS, id);
  }
  async storePreKey(key: PreKey): Promise<void> {
    return idbPut(STORE_PRE_KEYS, key.id, key);
  }
  async removePreKey(id: number): Promise<void> {
    return idbDelete(STORE_PRE_KEYS, id);
  }

  async loadSignedPreKey(id: number): Promise<SignedPreKey | null> {
    return idbGet<SignedPreKey>(STORE_SIGNED_PRE_KEYS, id);
  }
  async storeSignedPreKey(key: SignedPreKey): Promise<void> {
    return idbPut(STORE_SIGNED_PRE_KEYS, key.id, key);
  }
  async removeSignedPreKey(id: number): Promise<void> {
    return idbDelete(STORE_SIGNED_PRE_KEYS, id);
  }

  async loadSession(peerId: string): Promise<RatchetSession | null> {
    return idbGet<RatchetSession>(STORE_SESSIONS, peerId);
  }
  async storeSession(peerId: string, session: RatchetSession): Promise<void> {
    return idbPut(STORE_SESSIONS, peerId, session);
  }
  async deleteSession(peerId: string): Promise<void> {
    return idbDelete(STORE_SESSIONS, peerId);
  }
}

// ── In-Memory KeyStore (tests / Node.js environments only) ───────────────────
// WARNING: All keys are lost when the page is closed.
// This store MUST NOT be used in production — it exists solely for unit tests
// and server-side Node.js tooling that has no IndexedDB.

export class InMemoryKeyStore implements KeyStore {
  private _identity: IdentityKeyPair | null = null;
  private _regId: number | null = null;
  private _preKeys = new Map<number, PreKey>();
  private _signedPreKeys = new Map<number, SignedPreKey>();
  private _sessions = new Map<string, RatchetSession>();

  async getIdentityKeyPair() { return this._identity; }
  async saveIdentityKeyPair(pair: IdentityKeyPair) { this._identity = pair; }
  async getLocalRegistrationId() { return this._regId; }
  async saveLocalRegistrationId(id: number) { this._regId = id; }
  async loadPreKey(id: number) { return this._preKeys.get(id) ?? null; }
  async storePreKey(key: PreKey) { this._preKeys.set(key.id, key); }
  async removePreKey(id: number) { this._preKeys.delete(id); }
  async loadSignedPreKey(id: number) { return this._signedPreKeys.get(id) ?? null; }
  async storeSignedPreKey(key: SignedPreKey) { this._signedPreKeys.set(key.id, key); }
  async removeSignedPreKey(id: number) { this._signedPreKeys.delete(id); }
  async loadSession(peerId: string) { return this._sessions.get(peerId) ?? null; }
  async storeSession(peerId: string, session: RatchetSession) { this._sessions.set(peerId, session); }
  async deleteSession(peerId: string) { this._sessions.delete(peerId); }
}
