import type { Except } from "type-fest";
import type {
  IAmount,
  IDonation,
  IParent,
  IProgram,
  TToType,
} from "@/donations";

/** IAmounts pertains to npo share,
 * if npo is part of a fund, amounts -> total / num_members
 */

export interface IParts {
  amnt: IAmount;
  amnt_usd: IAmount;
  fa: IAmount;
  sttl: IAmount;
  sttl_fee: IAmount;
  sttl_fa: IAmount;
}

export interface Tx
  extends Except<
    IDonation,
    | "id"
    | "created_at"
    | "amount"
    | "settlement"
    | "to_id"
    | "to_type"
    | "to_name"
    | "to_members"
    | "to_tip_allowed"
    | "program"
    | "form_id"
  > {}

export interface ISttlmnt {
  id: string;
  date: string;
  currency: string;
}
/** source form */
export interface ISource {
  id: string;
  tag?: string;
}

export interface IInput {
  id: number;
  ps: IParts;
  sttl: ISttlmnt;
  prnt: IParent & { type: TToType };
  source: ISource | undefined;
  /** if this settlement is also attributed to a program (typically not included for fund member npo) */
  program: IProgram | undefined;
  /** snapshot from init — consistent across fund members */
  nav_price: number;
  tx: Tx;
}
