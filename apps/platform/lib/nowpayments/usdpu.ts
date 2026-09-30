import { tokens_map } from "@better-giving/crypto";
import type { Nowpayments } from "./index";

/**
 * usdc on any chain is a dollar. the estimate quotes nowpayments' own
 * conversion, spread included, so it prices usdc away from 1. usdc.e (bridged)
 * carries its own symbol and keeps the estimate.
 */
export const pinned_usdpu = (code: string): number | null =>
  tokens_map[code.toUpperCase()]?.symbol === "USDC" ? 1 : null;

/** usd per unit of `code` for valuing a donation: receipt, match, dashboard, dist */
export const usdpu_of = async (
  np: Pick<Nowpayments, "estimate">,
  code: string
): Promise<number> => pinned_usdpu(code) ?? (await np.estimate(code)).usdpu;
