import type { ServerKey } from "@/env";
import type { DepositChain } from "../deposit-addr";

interface IAlchemyChain {
  /** coingecko asset platform id, for token prices */
  cg_platform: string;
  deposit_chain: DepositChain;
  signing_key_env: ServerKey;
}

export const ALCHEMY_CHAINS = {
  "eth-mainnet": {
    cg_platform: "ethereum",
    deposit_chain: "eth",
    signing_key_env: "ALCHEMY_SIGNING_KEY_ETH_MAINNET",
  },
  "bnb-mainnet": {
    cg_platform: "binance-smart-chain",
    deposit_chain: "bnb",
    signing_key_env: "ALCHEMY_SIGNING_KEY_BNB_MAINNET",
  },
} as const satisfies Record<string, IAlchemyChain>;

export type TAlchemyChainId = keyof typeof ALCHEMY_CHAINS;

export interface IActivity {
  /** sender wallet address  */
  fromAddress: string;
  /** recipient wallet address */
  toAddress: string;
  hash: string;
  /** condensed */
  value: number;
  /** contract SYMBOL or ETH (native transfer) */
  asset: string;
  category: "token" | "external" | (string & {});
  rawContract: {
    // contract address
    address?: string; // only present for token transfers
    decimals: string;
  };
}
export interface IPayload {
  event: {
    /** synonymous to path :chain_id e.g. BNB_MAINNET, ETH_MAINNET */
    network: string;
    activity: IActivity[];
  };
}

export interface IPriceByKey {
  [address_or_coin_id: string]: { usd?: number } | undefined;
}
