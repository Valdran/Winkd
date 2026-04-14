// ── WebCrypto Primitives ──
// Real Signal-Protocol-compatible cryptography using the SubtleCrypto API.
// Algorithm: P-256 for all DH and signing operations (ECDH + ECDSA).
// The same P-256 JWK (key_ops stripped) can be imported as either algorithm,
// mirroring how Signal uses Curve25519/Ed25519 on the same scalar.
//
// No external dependencies — SubtleCrypto is available in all modern browsers
// and Node.js 15+.

const subtle = globalThis.crypto.subtle;

// ── Encoding helpers ──────────────────────────────────────────────────────────

export function bufToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToBuf(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bufToHex(buf: Uint8Array): string {
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexToBuf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i >> 1] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export function concatBufs(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.length;
  }
  return out;
}

// ── DH key pair ───────────────────────────────────────────────────────────────

export interface DHKeyPair {
  /** Uncompressed P-256 public key, raw bytes, base64 (65 bytes) */
  publicKeyRaw: string;
  /**
   * P-256 private key as JWK JSON string.
   * key_ops is deliberately omitted so the same bytes can be re-imported
   * for ECDH (deriveBits) or ECDSA (sign) operations.
   */
  privateKeyJwk: string;
}

export async function generateDHKeyPair(): Promise<DHKeyPair> {
  const kp = await subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const pubRaw = await subtle.exportKey("raw", kp.publicKey);
  const privJwk = await subtle.exportKey("jwk", kp.privateKey);
  // Strip key_ops so we can re-import this JWK under either ECDH or ECDSA.
  const { key_ops: _, ...jwkClean } = privJwk;
  void _;
  return {
    publicKeyRaw: bufToBase64(pubRaw),
    privateKeyJwk: JSON.stringify(jwkClean),
  };
}

// ── Low-level key importers ───────────────────────────────────────────────────

async function importDHPublic(b64: string): Promise<CryptoKey> {
  return subtle.importKey(
    "raw",
    base64ToBuf(b64),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
}

async function importDHPrivate(jwkStr: string): Promise<CryptoKey> {
  return subtle.importKey(
    "jwk",
    JSON.parse(jwkStr) as JsonWebKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
}

async function importVerifyPublic(b64: string): Promise<CryptoKey> {
  return subtle.importKey(
    "raw",
    base64ToBuf(b64),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

async function importSigningPrivate(jwkStr: string): Promise<CryptoKey> {
  return subtle.importKey(
    "jwk",
    JSON.parse(jwkStr) as JsonWebKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

// ── ECDH ──────────────────────────────────────────────────────────────────────

/** Perform ECDH and return the 32-byte shared secret. */
export async function dh(privateKeyJwk: string, publicKeyB64: string): Promise<Uint8Array> {
  const priv = await importDHPrivate(privateKeyJwk);
  const pub = await importDHPublic(publicKeyB64);
  const bits = await subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256);
  return new Uint8Array(bits);
}

// ── Key derivation ────────────────────────────────────────────────────────────

/** HKDF-SHA256: input key material → `outBytes` bytes. */
export async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: string,
  outBytes: number,
): Promise<Uint8Array> {
  const baseKey = await subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode(info) },
    baseKey,
    outBytes * 8,
  );
  return new Uint8Array(bits);
}

async function hmacSha256(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const key = await subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await subtle.sign("HMAC", key, data));
}

/**
 * Double Ratchet KDF_RK: (rootKey, dhOutput) → (newRootKey, chainKey).
 * Both values are 32 bytes returned as lowercase hex strings.
 */
export async function kdfRootKey(
  rootKeyHex: string,
  dhOutput: Uint8Array,
): Promise<{ newRootKey: string; chainKey: string }> {
  const out = await hkdf(dhOutput, hexToBuf(rootKeyHex), "WinkdRatchetRK v1", 64);
  return {
    newRootKey: bufToHex(out.slice(0, 32)),
    chainKey: bufToHex(out.slice(32, 64)),
  };
}

/**
 * Double Ratchet KDF_CK: chainKey → (messageKey bytes, nextChainKey hex).
 * Uses HMAC-SHA256 with constant inputs 0x01 (message) and 0x02 (next chain).
 */
export async function kdfChainKey(chainKeyHex: string): Promise<{
  messageKey: Uint8Array;
  nextChainKey: string;
}> {
  const ck = hexToBuf(chainKeyHex);
  const messageKey = await hmacSha256(ck, new Uint8Array([0x01]));
  const nextCK = await hmacSha256(ck, new Uint8Array([0x02]));
  return { messageKey, nextChainKey: bufToHex(nextCK) };
}

// ── Symmetric encryption ──────────────────────────────────────────────────────

export interface AesGcmResult {
  /** AES-256-GCM ciphertext + 16-byte auth tag, base64 */
  ciphertext: string;
  /** 96-bit random IV, base64 */
  iv: string;
}

export async function aesGcmEncrypt(
  keyBytes: Uint8Array,
  plaintext: Uint8Array,
): Promise<AesGcmResult> {
  const key = await subtle.importKey("raw", keyBytes.slice(0, 32), "AES-GCM", false, ["encrypt"]);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { ciphertext: bufToBase64(ct), iv: bufToBase64(iv) };
}

export async function aesGcmDecrypt(
  keyBytes: Uint8Array,
  ciphertext: string,
  iv: string,
): Promise<Uint8Array> {
  const key = await subtle.importKey("raw", keyBytes.slice(0, 32), "AES-GCM", false, ["decrypt"]);
  const pt = await subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuf(iv) },
    key,
    base64ToBuf(ciphertext),
  );
  return new Uint8Array(pt);
}

// ── X3DH ─────────────────────────────────────────────────────────────────────

/**
 * X3DH — initiator (Alice) side.
 * Computes and returns the 32-byte shared secret SK.
 */
export async function x3dh(
  myIdentityPrivJwk: string,
  myEphemeralPrivJwk: string,
  theirIdentityPubB64: string,
  theirSignedPreKeyPubB64: string,
  theirOneTimePreKeyPubB64?: string,
): Promise<Uint8Array> {
  const DH1 = await dh(myIdentityPrivJwk, theirSignedPreKeyPubB64);
  const DH2 = await dh(myEphemeralPrivJwk, theirIdentityPubB64);
  const DH3 = await dh(myEphemeralPrivJwk, theirSignedPreKeyPubB64);

  const F = new Uint8Array(32).fill(0xff); // domain separator
  let dhInput = concatBufs(DH1, DH2, DH3);

  if (theirOneTimePreKeyPubB64 !== undefined) {
    const DH4 = await dh(myEphemeralPrivJwk, theirOneTimePreKeyPubB64);
    dhInput = concatBufs(dhInput, DH4);
  }

  return hkdf(concatBufs(F, dhInput), new Uint8Array(32), "Winkd X3DH v1", 32);
}

/**
 * X3DH — responder (Bob) side.
 * Computes the same SK as Alice (DH commutativity).
 */
export async function x3dhRespond(
  myIdentityPrivJwk: string,
  mySignedPreKeyPrivJwk: string,
  myOneTimePreKeyPrivJwk: string | undefined,
  theirIdentityPubB64: string,
  theirEphemeralPubB64: string,
): Promise<Uint8Array> {
  const DH1 = await dh(mySignedPreKeyPrivJwk, theirIdentityPubB64);
  const DH2 = await dh(myIdentityPrivJwk, theirEphemeralPubB64);
  const DH3 = await dh(mySignedPreKeyPrivJwk, theirEphemeralPubB64);

  const F = new Uint8Array(32).fill(0xff);
  let dhInput = concatBufs(DH1, DH2, DH3);

  if (myOneTimePreKeyPrivJwk !== undefined) {
    const DH4 = await dh(myOneTimePreKeyPrivJwk, theirEphemeralPubB64);
    dhInput = concatBufs(dhInput, DH4);
  }

  return hkdf(concatBufs(F, dhInput), new Uint8Array(32), "Winkd X3DH v1", 32);
}

// ── Signing ───────────────────────────────────────────────────────────────────

/** Sign a pre-key public key with the identity key (ECDSA-P256-SHA256). */
export async function signPreKey(
  identityPrivateJwk: string,
  preKeyPublicB64: string,
): Promise<string> {
  const signingKey = await importSigningPrivate(identityPrivateJwk);
  const sig = await subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signingKey,
    base64ToBuf(preKeyPublicB64),
  );
  return bufToBase64(sig);
}

/** Verify an ECDSA-P256-SHA256 pre-key signature. Returns false on any failure. */
export async function verifyPreKey(
  identityPublicB64: string,
  preKeyPublicB64: string,
  signatureB64: string,
): Promise<boolean> {
  try {
    const verifyKey = await importVerifyPublic(identityPublicB64);
    return await subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      verifyKey,
      base64ToBuf(signatureB64),
      base64ToBuf(preKeyPublicB64),
    );
  } catch {
    return false;
  }
}

// ── Key generation helpers ────────────────────────────────────────────────────

/** Generate a new P-256 identity key pair. */
export async function generateIdentityKeyPair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  const kp = await generateDHKeyPair();
  return { publicKey: kp.publicKeyRaw, privateKey: kp.privateKeyJwk };
}

/** Generate a one-time pre-key. */
export async function generatePreKeyPair(id: number): Promise<{
  id: number;
  publicKey: string;
  privateKey: string;
}> {
  const kp = await generateDHKeyPair();
  return { id, publicKey: kp.publicKeyRaw, privateKey: kp.privateKeyJwk };
}

/** Generate a signed pre-key — DH key pair + ECDSA signature from the identity key. */
export async function generateSignedPreKeyPair(
  id: number,
  identityPrivateJwk: string,
): Promise<{ id: number; publicKey: string; privateKey: string; signature: string }> {
  const kp = await generateDHKeyPair();
  const signature = await signPreKey(identityPrivateJwk, kp.publicKeyRaw);
  return { id, publicKey: kp.publicKeyRaw, privateKey: kp.privateKeyJwk, signature };
}

/** Generate a cryptographically random 14-bit registration ID (1–16384). */
export function newRegistrationId(): number {
  const buf = new Uint16Array(1);
  globalThis.crypto.getRandomValues(buf);
  return (buf[0] & 0x3fff) + 1;
}

// ── Safety numbers ────────────────────────────────────────────────────────────

/**
 * Compute a 60-digit safety number (12 groups of 5 decimal digits) from both
 * parties' identity public keys, sorted by Winkd ID for determinism.
 * Both peers will see the same number when compared out-of-band.
 */
export async function computeSafetyNumber(
  myWinkdId: string,
  myIdentityPublicB64: string,
  theirWinkdId: string,
  theirIdentityPublicB64: string,
): Promise<string> {
  const enc = new TextEncoder();
  const [id1, key1, id2, key2] =
    myWinkdId < theirWinkdId
      ? [myWinkdId, myIdentityPublicB64, theirWinkdId, theirIdentityPublicB64]
      : [theirWinkdId, theirIdentityPublicB64, myWinkdId, myIdentityPublicB64];

  const data = concatBufs(enc.encode(id1), base64ToBuf(key1), enc.encode(id2), base64ToBuf(key2));
  const hash = new Uint8Array(await subtle.digest("SHA-512", data));

  const groups: string[] = [];
  for (let i = 0; i < 12; i++) {
    const o = i * 5;
    // Fold 5 bytes into a value mod 100 000 for a 5-digit group
    const n =
      ((((hash[o] * 256 + hash[o + 1]) * 256 + hash[o + 2]) * 256 + hash[o + 3]) * 256 +
        hash[o + 4]) %
      100_000;
    groups.push(n.toString().padStart(5, "0"));
  }
  return groups.join(" ");
}
