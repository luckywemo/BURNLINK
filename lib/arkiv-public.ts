import { createPublicClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { http } from "viem";

// Read-only client. Anyone can construct this — there are no credentials.
// That is the censorship-resistance property in code form.
export const arkivPublic = createPublicClient({
  chain: tiramisu,
  transport: http(
    process.env.NEXT_PUBLIC_ARKIV_RPC ??
      "https://rpc.tiramisu.db-chain.testnet.arkiv.network"
  ),
});
