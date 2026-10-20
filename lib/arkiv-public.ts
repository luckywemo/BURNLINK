import { createPublicClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { http } from "viem";

// Read-only client. Anyone can construct this — there are no credentials.
// That is the censorship-resistance property in code form.
//
// In the browser the transport is our own /api/arkiv proxy, which appends the
// access key server-side (the key never ships to the client). Server-side —
// the /api/fund vault check — it uses the keyed RPC URL directly.
const RPC_BASE = (
  process.env.NEXT_PUBLIC_ARKIV_RPC ??
  "https://rpc.tiramisu.db-chain.testnet.arkiv.network"
).replace(/\/$/, "");

const TRANSPORT =
  typeof window === "undefined"
    ? process.env.ARKIV_API_KEY
      ? `${RPC_BASE}/${process.env.ARKIV_API_KEY}`
      : RPC_BASE
    : "/api/arkiv";

export const arkivPublic = createPublicClient({
  chain: tiramisu,
  transport: http(TRANSPORT),
});
