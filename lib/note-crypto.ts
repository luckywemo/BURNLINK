// AES-GCM-256 via WebCrypto. The key is generated on the client, travels only
// inside the URL fragment (never sent to any server or chain), and is the only
// thing that can decrypt the payload stored on Arkiv.

function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  return b64encode(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  return b64decode(s.replace(/-/g, "+").replace(/_/g, "/"));
}

// Burn capability: a random token carried in the URL fragment. Only its
// SHA-256 is stored in the (publicly readable) entity payload, so someone who
// enumerates note entities still can't delete notes they never received.
export function randomUrlToken(): string {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
}

export async function sha256b64(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return b64encode(d);
}

// Optional passphrase layer. When set, the URL fragment carries a random
// seed (not the key) and the real AES key is derived from seed + passphrase
// via PBKDF2 — so the link alone is inert and the passphrase is shared
// out-of-band. Without a passphrase the fragment carries the raw AES key,
// exactly as before (backwards compatible with existing links).
async function deriveKey(
  seed: Uint8Array,
  passphrase: string
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: seed as BufferSource,
      iterations: 600_000,
      hash: "SHA-256",
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptNote(
  plaintext: string,
  passphrase?: string
): Promise<{ iv: string; ct: string; urlKey: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  if (passphrase) {
    const seed = crypto.getRandomValues(new Uint8Array(32));
    const key = await deriveKey(seed, passphrase);
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext)
    );
    return {
      iv: b64encode(iv),
      ct: b64encode(ct),
      urlKey: b64urlEncode(seed),
    };
  }
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  const rawKey = await crypto.subtle.exportKey("raw", key);
  return {
    iv: b64encode(iv),
    ct: b64encode(ct),
    urlKey: b64urlEncode(rawKey),
  };
}

export async function decryptNote(
  ivB64: string,
  ctB64: string,
  urlKey: string,
  passphrase?: string
): Promise<string> {
  const key = passphrase
    ? await deriveKey(b64urlDecode(urlKey), passphrase)
    : await crypto.subtle.importKey(
        "raw",
        b64urlDecode(urlKey) as BufferSource,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
      );
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(ivB64) as BufferSource },
    key,
    b64decode(ctB64) as BufferSource
  );
  return new TextDecoder().decode(pt);
}

// Replies: a new entity pointed back at the original via its `replyto`
// attribute. The reply key is SHA-256 of the note's fragment secret — so
// the only readers are exactly the two people holding the link.
async function replyCryptoKey(urlKey: string): Promise<CryptoKey> {
  const d = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(urlKey)
  );
  return crypto.subtle.importKey(
    "raw",
    d,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptReply(
  text: string,
  urlKey: string
): Promise<{ iv: string; ct: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await replyCryptoKey(urlKey);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(text)
  );
  return { iv: b64encode(iv), ct: b64encode(ct) };
}

export async function decryptReply(
  ivB64: string,
  ctB64: string,
  urlKey: string
): Promise<string> {
  const key = await replyCryptoKey(urlKey);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(ivB64) as BufferSource },
    key,
    b64decode(ctB64) as BufferSource
  );
  return new TextDecoder().decode(pt);
}
