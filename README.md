# BurnLink — notes that provably die

Share a secret that **provably stops existing**. Encrypted in your browser,
stored as an [Arkiv](https://arkiv.network) entity on the Tiramisu testnet, and
deleted by the protocol — by burn-after-read or by Entity Expiration — never by
someone's promise.

Built for **Arkiv: Global Tour Stop 🌍** (9–18 Oct 2026). Tracks entered:
**Privacy** and **Security**.

## How it works

1. You type a note — or attach an **image**. The browser encrypts it with
   **AES-GCM-256** (WebCrypto).
2. Only the ciphertext becomes an Arkiv entity — `{ iv, ct, bh }` — with the
   Entity Expiration you picked (15 seconds → 30 days).
3. The decryption key is placed **inside the link fragment** (`#k=…&b=…`).
   Fragments are never sent over the network.
4. The recipient opens the link: ciphertext is fetched with a credential-free
   **public client**, decrypted locally, and — for burn-after-read notes — the
   entity is **deleted on-chain**. Reloading the link shows "gone".

## Features

- **Burn-after-read** — reading fires a real `deleteEntity`; the explorer
  shows the deletion transaction.
- **Timed expiry** — 15s → 30d via Arkiv Entity Expiration. The holder can
  **extend the fuse** (`extendEntity` +5m/+1h) or **burn it now** — both gated
  by the burn-capability token.
- **Passphrase layer** — optional second secret; PBKDF2-derived key, wrong
  guesses can't burn the note.
- **Image notes** — downscaled client-side to fit the entity cap, encrypted
  inside the same envelope; indistinguishable from text on-chain.
- **Replies** — sender-opt-in. The recipient's reply is a `burnlink-reply`
  entity pointed at the note via a `replyto` attribute, readable only by
  link-holders.
- **QR hand-off** — the link QR is generated locally; the key never leaves the
  browser.
- **Live sealed counter** — `getEntityNonce` on the relay; burns still count.
- **Sender retract** — kill the link right after sealing.

## Why Arkiv is load-bearing

- **Postgres/S3:** deletion is a promise by an operator who can be breached,
  subpoenaed, or simply careless. On Arkiv, Entity Expiration and
  `deleteEntity` are enforced by the protocol and visible on the explorer.
- **IPFS:** no expiry, no delete — content-addressed data is forever.
- **Own API + encrypted blobs:** still one operator holding ciphertext it could
  keep forever or hand over. With Arkiv the ciphertext sits on a public chain;
  there is no operator to compel, and deletion is verifiable.

## Schema & evidence

- [`/arkiv/schema.md`](arkiv/schema.md) — entity types, attributes, expirations, queries
- [`/arkiv/friction.md`](arkiv/friction.md) — build friction report
- Entity-creating wallet: `0x4d3Af8811dB4D23D1cb0Ad8355c419d05fd467AB` (relay)

## Run locally

```bash
cp .env.example .env.local   # add a funded Tiramisu wallet key
npm install
npm run dev                  # http://localhost:3000
```

Requires Node ≥ 20 and [`@arkiv-network/sdk@0.8.1`](https://www.npmjs.com/package/@arkiv-network/sdk).

## Design notes

- **Relay wallet** signs all note writes so users need no wallet — consumer UX
  and a privacy property: every note shares one `$creator`, unlinkable to its
  author.
- **Burn token** (`bh`): entity keys are enumerable via `$creator`, so deletion
  requires the token whose SHA-256 is in the payload — carried only in the link
  fragment. See `arkiv/schema.md`.
- Demo data is **synthetic** — per the rules, never put real secrets in a note.

MIT © BurnLink contributors 2026

*Asset note:* `public/fire-bg.mp4` is a third-party "fiery background"
animation sourced via Pinterest (pin.it/Tqb7jF9At) — used for hackathon demo
purposes; verify its licence before production reuse.
