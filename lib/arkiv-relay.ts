import { createWalletClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC_BASE = (
  process.env.NEXT_PUBLIC_ARKIV_RPC ??
  "https://rpc.tiramisu.db-chain.testnet.arkiv.network"
).replace(/\/$/, "");

// Server-side transport: append the Arkiv access key when configured so the
// relay's own reads/writes get the raised query quota.
const RPC = process.env.ARKIV_API_KEY
  ? `${RPC_BASE}/${process.env.ARKIV_API_KEY}`
  : RPC_BASE;

// The relay wallet signs entity creates/deletes so readers and writers never
// need a wallet of their own. It is the $creator of every anonymous note —
// which is the point: notes are unlinkable to their authors by design.
export function getRelayClient() {
  const key = process.env.ARKIV_RELAY_KEY as `0x${string}` | undefined;
  if (!key) throw new Error("ARKIV_RELAY_KEY is not set");
  return createWalletClient({
    account: privateKeyToAccount(key),
    chain: tiramisu,
    transport: http(RPC),
  });
}

export function getRelayAddress() {
  const key = process.env.ARKIV_RELAY_KEY as `0x${string}` | undefined;
  return key ? privateKeyToAccount(key).address : null;
}
