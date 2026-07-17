import type { IRebalancePayload as FV } from "@/nav/schemas";

export {
  type IBals,
  type IRebalancePayload as FV,
  type IRebalanceTx as Tx,
  rebalance_log as fv,
  ticker_nets,
} from "@/nav/schemas";

export interface FormState {
  type: "form";
  data?: FV;
}

export interface ReviewState {
  type: "review";
  data: FV;
}

export type State = FormState | ReviewState;
