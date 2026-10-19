# BurnLink — Arkiv schema

Everything below is on the **Tiramisu testnet** (chain ID `7738577`).

## Entity types

### `burnlink` — a sealed note

| Field | Value | Why |
|---|---|---|
| `payload` | `application/json`: `{ v: 1, iv: string, ct: string, bh?: string }` | `iv`/`ct` are the AES-GCM-256 ciphertext. `bh` is base64 SHA-256 of the burn token. The decryption key is never stored anywhere — it lives in the URL fragment only. |
| `contentType` | `application/json` | — |
| `attributes.type` | `str` `"burnlink"` | entity type discriminator |
| `attributes.v` | `i32` `1` | schema version (numeric, in case we ever need range queries) |
| `attributes.mode` | `str` `"once"` \| `"timed"` | burn-after-read vs expire-only. |
| `attributes.pw` | `i32` `1` (optional) | passphrase-gated note — the read page shows a gate. The passphrase itself is never transmitted or stored; it's only a KDF input in the browser. |
| `attributes.replies` | `i32` `1` (optional) | sender opted in to replies — the read page offers a reply box. |
| `expires` | `ExpirationTime.fromSeconds(ttl)`, ttl ∈ [15s, 30d] — presets or custom | User-chosen Entity Expiration — the protocol deletes the ciphertext, not us. |

Still only ~5 attributes — deliberately few (privacy pillar: what the explorer
shows is minimal, and nothing but ciphertext is ever in the payload).

**Plaintext envelope.** The decrypted plaintext is either raw UTF-8 text, or a
JSON envelope `{"i":"data:image/…"}` for image notes (browser-side downscale to
fit the 128 KiB entity cap). The envelope lives *inside* the ciphertext — the
chain can't distinguish a text note from an image note.

**Passphrase layer.** With `pw`, the link fragment carries a 32-byte *seed* and
the AES key is derived in-browser via PBKDF2-SHA-256 (600k iterations) over
`passphrase + seed`. The link alone is inert; a wrong passphrase fails GCM auth
before the entity is ever touched — it can't burn the note.

**`bh` — the burn-capability hash.** Entity keys are enumerable (anyone can list
the relay's entities via `$creator`), so a bare "delete by key" endpoint would
let a stranger burn every note. The raw token `b` travels in the URL fragment;
only its SHA-256 is on-chain. The burn and extend APIs recompute the hash and
refuse mismatches — holders of the link can delete *or* feed the fuse, nobody
else can.

### `burnlink-reply` — a recipient's reply to a note

| Field | Value | Why |
|---|---|---|
| `payload` | `application/json`: `{ v: 1, iv, ct }` | ciphertext only. Reply key = SHA-256 of the original link's `k` fragment, so only the two link-holders can read it. |
| `attributes.type` | `str` `"burnlink-reply"` | discriminator |
| `attributes.v` | `i32` `1` | schema version |
| `attributes.mode` | `str` `"timed"` | replies always expire — they die too |
| `attributes.replyto` | `str` `<original entity key>` | the pointer the sender's page queries on |
| `expires` | 24h | protocol-enforced, same as notes |

Replies carry **no `bh`** — they can't be burned early by anyone, they simply
expire. Replies can outlive the note they answer (a burn-after-read note is
deleted on read; the sender may still have their page open to receive replies).

## Mutations the app performs

- `createEntity` — notes and replies (relay-signed)
- `deleteEntity` — burn-after-read, holder-initiated "burn it now", sender retract
- `extendEntity` — "+5 min / +1 hour" on a live timed note, gated by the same `bh`

## System attributes used

- `$creator` — the relay address; proves which entities BurnLink wrote (and is
  the query judges use to enumerate our ciphertext).
- `$expiresAt` — shown to the reader in the on-chain proof panel.

## Queries the app runs

| Where | Query | Purpose |
|---|---|---|
| Read page | `getEntity(entityKey)` — public client, no credentials | fetch ciphertext + attributes; the read path needs nothing from our backend |
| Sender page | `select * where replyto = str(<entityKey>)` | poll for replies addressed to a sealed note — the chain is the mailbox |
| Landing | `getEntityNonce(relay)` | the "N sealed on-chain" counter — counts burned notes too (nonce never decreases) |
| Repro check | `select * where $creator = addr(0x4d3Af8811dB4D23D1cb0Ad8355c419d05fd467AB)` | enumerate BurnLink's ciphertext entities — works in the public Data Explorer |

## Wallets that create entities

| Address | Role |
|---|---|
| `0x4d3Af8811dB4D23D1cb0Ad8355c419d05fd467AB` | Relay — signs `createEntity` for sealed notes and `deleteEntity` for burn-after-read. Holds only test GLM. Being the shared `$creator` is a privacy feature: notes are unlinkable to authors. |

## What deliberately stays off Arkiv

- **The AES key** — URL fragment only; never transmitted, never stored.
- **The burn token** — same; only its SHA-256 is in the payload.
- **The passphrase** — a KDF input in the browser only; the chain sees just a `pw` flag.
- **Reply keys** — derived from the link fragment on-device; never stored.
- **Plaintext** — never leaves the browser unencrypted.
- **User accounts** — there are none.
