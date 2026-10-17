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

export async function encryptNote(
  plaintext: string
): Promise<{ iv: string; ct: string; urlKey: string }> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
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
  urlKey: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
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
