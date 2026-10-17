# BurnLink — Arkiv schema

Everything below is on the **Tiramisu testnet** (chain ID `7738577`).

## Entity types

### `burnlink` — a sealed note (the only entity type)

| Field | Value | Why |
|---|---|---|
| `payload` | `application/json`: `{ v: 1, iv: string, ct: string, bh?: string }` | `iv`/`ct` are the AES-GCM-256 ciphertext. `bh` is base64 SHA-256 of the burn token. The decryption key is never stored anywhere — it lives in the URL fragment only. |
| `contentType` | `application/json` | — |
| `attributes.type` | `str` `"burnlink"` | entity type discriminator |
| `attributes.v` | `i32` `1` | schema version (numeric, in case we ever need range queries) |
| `attributes.mode` | `str` `"once"` \| `"timed"` | burn-after-read vs expire-only. Three attributes total — deliberately few (privacy pillar: what the explorer shows is minimal). |
| `expires` | `ExpirationTime.fromSeconds(ttl)`, ttl ∈ {600, 3600, 86400, 604800} | User-chosen Entity Expiration — the protocol deletes the ciphertext, not us. |

**`bh` — the burn-capability hash.** Entity keys are enumerable (anyone can list
the relay's entities via `$creator`), so a bare "delete by key" endpoint would
let a stranger burn every note. The raw token `b` travels in the URL fragment;
only its SHA-256 is on-chain. The burn API recomputes the hash and refuses
mismatches.

## System attributes used

- `$creator` — the relay address; proves which entities BurnLink wrote (and is
  the query judges use to enumerate our ciphertext).
- `$expiresAt` — shown to the reader in the on-chain proof panel.

## Queries the app runs

| Where | Query | Purpose |
|---|---|---|
| Read page | `getEntity(entityKey)` — public client, no credentials | fetch ciphertext + attributes; the read path needs nothing from our backend |
| Repro check | `select * where $creator = addr(0x4d3Af8811dB4D23D1cb0Ad8355c419d05fd467AB)` | enumerate BurnLink's ciphertext entities — works in the public Data Explorer |

## Wallets that create entities

| Address | Role |
|---|---|
| `0x4d3Af8811dB4D23D1cb0Ad8355c419d05fd467AB` | Relay — signs `createEntity` for sealed notes and `deleteEntity` for burn-after-read. Holds only test GLM. Being the shared `$creator` is a privacy feature: notes are unlinkable to authors. |

## What deliberately stays off Arkiv

- **The AES key** — URL fragment only; never transmitted, never stored.
- **The burn token** — same; only its SHA-256 is in the payload.
- **Plaintext** — never leaves the browser unencrypted.
- **User accounts** — there are none.
