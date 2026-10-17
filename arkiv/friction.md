# BurnLink — Arkiv friction report

Format: surface → what we expected → what actually happened → versions → repro.

## 1. Faucet — no programmatic path to test GLM

- **Expected:** an RPC method (`arkiv_requestFunds`/`eth_requestFunds`) or a
  documented faucet API, so a fresh burner wallet can be funded from CI or a
  script.
- **Actual:** `POST /api/faucet` on hub.arkiv.network answers
  `{"error":"Unauthorized"}`; no `rpc_modules`; `arkiv_requestFunds`,
  `eth_requestFunds`, `faucet_requestFunds` all return `-32601`. The only path
  is the wallet-connected UI.
- **Versions:** RPC `https://rpc.tiramisu.db-chain.testnet.arkiv.network`,
  2026-10-17.
- **Repro:** `curl -X POST <rpc> -d '{"method":"arkiv_requestFunds","params":["0x…"]}'` → method not found.
- **Would fix:** a rate-limited unauthenticated `POST {address}` faucet API, or
  an `arkiv_*` RPC drip method on the testnet node.

## 2. Attribute values arrive as tagged objects, not primitives

- **Expected:** `entity.attributes.mode` to be the string `"once"`, matching
  how we wrote it.
- **Actual:** `{ type: "str", value: "once" }` — the wire type is a tagged
  `ArkivValue`. Not harmful once known, but the "Querying Data" docs don't show
  the decoded read shape.
- **Versions:** `@arkiv-network/sdk@0.8.1`.
- **Repro:** `createEntity` with `attributes: { mode: "once" }`, then
  `getEntity` → `entity.attributes.mode` is an object.
- **Would fix:** one line in the reading-entities doc showing the
  `{ type, value }` envelope.

## 3. No "entity deleted" confirmation distinction

- **Expected:** a way to distinguish "burned by owner" from "expired by
  protocol" when reading a key that no longer exists.
- **Actual:** `getEntity` fails the same way for both. The deletion *is* visible
  on the block explorer as a transaction, which is what we surface in the UI —
  so this is a docs gap more than a bug: a canonical "look up an entity's fate"
  recipe would help.
- **Versions:** `@arkiv-network/sdk@0.8.1`.

## 4. Went smoothly (documented, tested)

- `createEntity` / `deleteEntity` round-trip with `ExpirationTime.fromSeconds`.
- `getEntity` from a credential-free public client — the read path truly needs
  no secrets.
- `jsonToPayload` + `entity.toJson()` round-trip.
- The frozen `AGENTS.md` in the challenge repo accurately described the query
  model (no `orderBy`, ranges only on numeric attributes, payload not
  queryable) — we designed the schema around it first and avoided the traps.
