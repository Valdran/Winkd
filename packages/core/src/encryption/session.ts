// ── Signal-Protocol Double Ratchet Session Manager ──
// Implements X3DH key agreement (initiator + responder) and the Double Ratchet
// algorithm for forward-secret, break-in-recovery encrypted messaging.
//
// Cryptographic primitives are delegated to crypto.ts (WebCrypto / SubtleCrypto).
// All keys are serialised as hex / base64 / JWK so they survive IndexedDB storage.
//
// References:
//   https://signal.org/docs/specifications/x3dh/
//   https://signal.org/docs/specifications/doubleratchet/

import type { EncryptedEnvelope, PreKeyBundle, RatchetSession } from "./types";
import type { KeyStore } from "./keystore";
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  bufToHex,
  dh,
  generateDHKeyPair,
  hexToBuf,
  kdfChainKey,
  kdfRootKey,
  verifyPreKey,
  x3dh,
  x3dhRespond,
} from "./crypto";

// ── Wire formats ──────────────────────────────────────────────────────────────

interface RatchetHeader {
  /** Sender's current DH ratchet public key (base64) */
  rk: string;
  /** Message number within this ratchet chain */
  n: number;
  /** Number of messages sent in the *previous* ratchet chain */
  pn: number;
}

interface WireMessage {
  h: RatchetHeader;
  /** AES-256-GCM ciphertext + auth tag, base64 */
  ct: string;
  /** 96-bit IV, base64 */
  iv: string;
}

interface PreKeyWireMessage extends WireMessage {
  /** Sender's identity public key (base64) */
  ik: string;
  /** Sender's X3DH ephemeral public key (base64) */
  ek: string;
  /** ID of the signed pre-key used */
  spkId: number;
  /** ID of the one-time pre-key used, or null */
  opkId: number | null;
}

// ── Max skipped messages ──────────────────────────────────────────────────────
// Prevents an attacker from forcing unbounded key storage by sending a
// message with a very large sequence number.
const MAX_SKIP = 500;

// ── Session Manager ───────────────────────────────────────────────────────────

export class SignalSessionManager {
  constructor(private readonly store: KeyStore) {}

  // ── Initiator setup (Alice) ───────────────────────────────────────────────
  /**
   * Initialise a Double Ratchet session with a new contact using their
   * PreKeyBundle (X3DH).  Call this when a contact request is accepted.
   * The first `encrypt()` call afterwards will produce a type-1 PreKeyMessage.
   */
  async initSessionFromBundle(peerId: string, bundle: PreKeyBundle): Promise<void> {
    // Verify the signed pre-key signature before using any key material.
    const valid = await verifyPreKey(
      bundle.identityKey,
      bundle.signedPreKey.publicKey,
      bundle.signedPreKey.signature,
    );
    if (!valid) {
      throw new Error(`[SignalSession] Invalid signed pre-key signature from ${peerId}`);
    }

    const idKP = await this.store.getIdentityKeyPair();
    if (!idKP) throw new Error("[SignalSession] No local identity key — call generateIdentityKeyPair() first");

    // Generate Alice's ephemeral key for X3DH.
    const ek = await generateDHKeyPair();

    // X3DH → shared secret SK.
    const SK = await x3dh(
      idKP.privateKey,
      ek.privateKeyJwk,
      bundle.identityKey,
      bundle.signedPreKey.publicKey,
      bundle.oneTimePreKey?.publicKey,
    );

    // Double Ratchet init (Alice / initiator):
    //   state.DHs = new ratchet key pair
    //   state.DHr = SPK_B  (Bob's signed pre-key)
    //   (RK, CKs) = KDF_RK(SK, DH(DHs, DHr))
    const ratchetKP = await generateDHKeyPair();
    const dhOut = await dh(ratchetKP.privateKeyJwk, bundle.signedPreKey.publicKey);
    const { newRootKey, chainKey } = await kdfRootKey(bufToHex(SK), dhOut);

    const session: RatchetSession = {
      rootKey: newRootKey,
      sendChainKey: chainKey,
      recvChainKey: null,
      sendCount: 0,
      recvCount: 0,
      prevSendCount: 0,
      ourRatchetPublic: ratchetKP.publicKeyRaw,
      ourRatchetPrivate: ratchetKP.privateKeyJwk,
      theirRatchetPublic: bundle.signedPreKey.publicKey,
      skipped: {},
      isInitiator: true,
      pendingPreKeyMsg: {
        identityKey: idKP.publicKey,
        ephemeralKey: ek.publicKeyRaw,
        spkId: bundle.signedPreKey.id,
        opkId: bundle.oneTimePreKey?.id ?? null,
      },
    };

    await this.store.storeSession(peerId, session);
  }

  // ── Encrypt ───────────────────────────────────────────────────────────────
  /**
   * Encrypt a plaintext string for `peerId`.
   * The first call after `initSessionFromBundle` produces a type-1
   * PreKeySignalMessage; all subsequent calls produce type-2 SignalMessages.
   */
  async encrypt(peerId: string, plaintext: string): Promise<EncryptedEnvelope> {
    const session = await this.store.loadSession(peerId);
    if (!session) throw new Error(`[SignalSession] No session for ${peerId} — call initSessionFromBundle() first`);

    const regId = (await this.store.getLocalRegistrationId()) ?? 0;

    if (!session.sendChainKey) {
      throw new Error("[SignalSession] Session has no sending chain key");
    }

    // Advance the sending chain to derive this message's key.
    const { messageKey, nextChainKey } = await kdfChainKey(session.sendChainKey);
    session.sendChainKey = nextChainKey;

    const pt = new TextEncoder().encode(plaintext);
    const { ciphertext, iv } = await aesGcmEncrypt(messageKey, pt);

    const header: RatchetHeader = {
      rk: session.ourRatchetPublic,
      n: session.sendCount,
      pn: session.prevSendCount,
    };

    let wirePayload: WireMessage | PreKeyWireMessage;
    let type: 1 | 2;

    if (session.isInitiator && session.sendCount === 0 && session.pendingPreKeyMsg) {
      // First message from the initiator — embed X3DH params.
      const pkInfo = session.pendingPreKeyMsg;
      wirePayload = { ik: pkInfo.identityKey, ek: pkInfo.ephemeralKey, spkId: pkInfo.spkId, opkId: pkInfo.opkId, h: header, ct: ciphertext, iv };
      type = 1;
      delete session.pendingPreKeyMsg; // consumed
    } else {
      wirePayload = { h: header, ct: ciphertext, iv };
      type = 2;
    }

    session.sendCount++;
    await this.store.storeSession(peerId, session);

    return {
      type,
      ciphertext: btoa(JSON.stringify(wirePayload)),
      registrationId: regId,
    };
  }

  // ── Decrypt ───────────────────────────────────────────────────────────────
  /**
   * Decrypt an `EncryptedEnvelope` from `peerId`.
   * Handles both type-1 (PreKey, first message, initialises Bob's session)
   * and type-2 (regular Double Ratchet) envelopes.
   */
  async decrypt(peerId: string, envelope: EncryptedEnvelope): Promise<string> {
    const parsed = JSON.parse(atob(envelope.ciphertext)) as WireMessage | PreKeyWireMessage;

    let session: RatchetSession | null;

    if (envelope.type === 1) {
      // First message from the other party — initialise our session from it.
      session = await this.initSessionFromPreKey(peerId, parsed as PreKeyWireMessage);
    } else {
      session = await this.store.loadSession(peerId);
      if (!session) {
        throw new Error(`[SignalSession] No session for ${peerId}`);
      }
    }

    const msg = parsed as WireMessage;
    const { rk: theirRatchetKey, n: msgNum, pn: prevCount } = msg.h;

    // ── DH Ratchet step (if their ratchet key changed) ────────────────────
    if (session.theirRatchetPublic !== theirRatchetKey) {
      // Save skipped keys from the tail of the previous receiving chain.
      await this.skipMessageKeys(session, prevCount);

      // Step A: derive new receiving chain from DH(our ratchet key, their new ratchet key).
      const dhOut1 = await dh(session.ourRatchetPrivate, theirRatchetKey);
      const step1 = await kdfRootKey(session.rootKey, dhOut1);
      session.recvChainKey = step1.chainKey;
      session.rootKey = step1.newRootKey;
      session.recvCount = 0;

      // Step B: generate a fresh ratchet key pair and derive new sending chain.
      const newKP = await generateDHKeyPair();
      const dhOut2 = await dh(newKP.privateKeyJwk, theirRatchetKey);
      const step2 = await kdfRootKey(session.rootKey, dhOut2);
      session.sendChainKey = step2.chainKey;
      session.rootKey = step2.newRootKey;
      session.prevSendCount = session.sendCount;
      session.sendCount = 0;

      session.ourRatchetPublic = newKP.publicKeyRaw;
      session.ourRatchetPrivate = newKP.privateKeyJwk;
      session.theirRatchetPublic = theirRatchetKey;
    }

    // ── Retrieve message key ──────────────────────────────────────────────
    const skippedKey = `${theirRatchetKey}:${msgNum}`;
    let messageKey: Uint8Array;

    if (Object.prototype.hasOwnProperty.call(session.skipped, skippedKey)) {
      // Out-of-order message: use the previously saved key.
      messageKey = hexToBuf(session.skipped[skippedKey]);
      delete session.skipped[skippedKey];
    } else {
      // Advance the receiving chain to the target message number.
      await this.skipMessageKeys(session, msgNum);

      if (!session.recvChainKey) {
        throw new Error("[SignalSession] No receiving chain key");
      }
      const { messageKey: mk, nextChainKey } = await kdfChainKey(session.recvChainKey);
      messageKey = mk;
      session.recvChainKey = nextChainKey;
      session.recvCount = msgNum + 1;
    }

    await this.store.storeSession(peerId, session);

    const pt = await aesGcmDecrypt(messageKey, msg.ct, msg.iv);
    return new TextDecoder().decode(pt);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Advance the receiving chain key up to (but not including) `target`,
   * saving each skipped message key for potential out-of-order delivery.
   */
  private async skipMessageKeys(session: RatchetSession, target: number): Promise<void> {
    if (!session.recvChainKey || !session.theirRatchetPublic) return;
    if (target > session.recvCount + MAX_SKIP) {
      throw new Error(`[SignalSession] Too many skipped messages (max ${MAX_SKIP})`);
    }
    while (session.recvCount < target) {
      const { messageKey, nextChainKey } = await kdfChainKey(session.recvChainKey);
      session.skipped[`${session.theirRatchetPublic}:${session.recvCount}`] =
        bufToHex(messageKey);
      session.recvChainKey = nextChainKey;
      session.recvCount++;
    }
  }

  /**
   * Initialise Bob's session when receiving Alice's first (type-1) message.
   * Performs the responder side of X3DH then sets up the Double Ratchet.
   */
  private async initSessionFromPreKey(
    peerId: string,
    msg: PreKeyWireMessage,
  ): Promise<RatchetSession> {
    const idKP = await this.store.getIdentityKeyPair();
    if (!idKP) throw new Error("[SignalSession] No local identity key");

    // Load the signed pre-key that Alice addressed.
    const spk = await this.store.loadSignedPreKey(msg.spkId);
    if (!spk) throw new Error(`[SignalSession] Signed pre-key ${msg.spkId} not found`);

    // Optionally load and consume the one-time pre-key.
    let opkPrivate: string | undefined;
    if (msg.opkId !== null) {
      const opk = await this.store.loadPreKey(msg.opkId);
      if (opk) {
        opkPrivate = opk.privateKey;
        await this.store.removePreKey(msg.opkId); // one-time — consume immediately
      }
    }

    // X3DH (responder) → shared secret SK.
    const SK = await x3dhRespond(
      idKP.privateKey,
      spk.privateKey,
      opkPrivate,
      msg.ik,
      msg.ek,
    );

    // Double Ratchet init (Bob / responder):
    //   Bob's initial ratchet key = SPK_B
    //   Alice's initial ratchet key = msg.h.rk
    //   (RK1, CKr) = KDF_RK(SK, DH(SPK_B, Alice.rk))
    //   Bob generates new ratchet key pair newKP
    //   (RK2, CKs) = KDF_RK(RK1, DH(newKP, Alice.rk))
    const dhOut1 = await dh(spk.privateKey, msg.h.rk);
    const { newRootKey: rk1, chainKey: ckr } = await kdfRootKey(bufToHex(SK), dhOut1);

    const bobRatchetKP = await generateDHKeyPair();
    const dhOut2 = await dh(bobRatchetKP.privateKeyJwk, msg.h.rk);
    const { newRootKey: rk2, chainKey: cks } = await kdfRootKey(rk1, dhOut2);

    const session: RatchetSession = {
      rootKey: rk2,
      sendChainKey: cks,
      recvChainKey: ckr,
      sendCount: 0,
      recvCount: 0,
      prevSendCount: 0,
      ourRatchetPublic: bobRatchetKP.publicKeyRaw,
      ourRatchetPrivate: bobRatchetKP.privateKeyJwk,
      theirRatchetPublic: msg.h.rk,
      skipped: {},
      isInitiator: false,
    };

    await this.store.storeSession(peerId, session);
    return session;
  }
}
