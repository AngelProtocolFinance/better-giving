import type {
  IDonation,
  IDonationSettled,
  TDonationSource,
} from "../donations";
import type { IReg } from "../reg/schema";
import type { TFrequency } from "../schemas";
import type { IMsg } from "./types";

interface IFromAddress {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
}

// dedupe keys ship to qstash and gate at-most-once delivery — preserve
// existing strings verbatim. reg-updated intentionally embeds Date.now(),
// which disables dedupe for that kind; preserved as-is for now.

export interface IDonDistPayload {
  id: string;
  date_created: string;
  amount: number;
  amount_usd: number;
  amount_denom: string;
  frequency: TFrequency;
  via: string;
  source: TDonationSource | (string & {});
  to_id: number;
  to_name: string;
  net: number;
  sttl_date: string;
  from_email: string;
  from?: { name?: string; company?: string; address?: IFromAddress };
  program?: { id: string; name: string };
  to_claimed?: boolean;
  form?: { id: string; tag?: string };
}

export interface IBankingPayload {
  npo_id: number;
  bank_summary?: string;
  rejection_reason?: string;
}

export interface IFundMemberRemovedPayload {
  fund_id: string;
  creator_id: string;
  creator_name: string;
  removed_npo_ids: number[];
}

export interface IInviteEmailPayload {
  invitee: string;
  invitee_first_name: string;
  invitor: string;
  npo_name: string;
}

export interface ILockTxCreatedPayload {
  npo_id: number;
  account: string;
  account_other: string;
  bal_begin: string | number;
  bal_end: string | number;
  amount: string | number;
  date_created: string | Date;
}

export interface IRegCreatedPayload {
  id: string;
  r_id: string;
}

export interface ISubDeactivatedPayload {
  id: string;
  platform: string;
  status_cancel_reason?: string | null;
}

export interface ITipReceivedPayload {
  id: string;
  date: string;
  npo_name: string;
  npo_id: number;
  type_tip: {
    input: number;
    denom: string;
    input_usd: number;
  };
}

export type Payloads = {
  "banking-approved": IBankingPayload;
  "banking-default": IBankingPayload;
  "banking-new": IBankingPayload;
  "banking-rejected": IBankingPayload;
  "don-dist": IDonDistPayload;
  "don-sttl-dist": IDonationSettled;
  "don-sttl-receipt": IDonation;
  "fund-member-removed": IFundMemberRemovedPayload;
  "invite-email": IInviteEmailPayload;
  "lock-tx-created": ILockTxCreatedPayload;
  "reg-created": IRegCreatedPayload;
  "reg-updated": IReg;
  "sub-deactivated": ISubDeactivatedPayload;
  "tip-received": ITipReceivedPayload;
};

export type Kind = keyof Payloads;

// producer input types. for most kinds this is just Payloads[K]; reg-updated
// historically accepted any {id: string | number}-shaped row because callers
// pass drizzle outputs (string | null fields) that don't satisfy IReg's
// string | undefined. wire payload is still the full row; the consumer
// narrows back to IReg.
export type MsgInput<K extends Kind> = K extends "reg-updated"
  ? { id: string | number }
  : Payloads[K];

export type Handlers = {
  [K in Kind]: (payload: Payloads[K]) => Promise<unknown>;
};

const dedupe: { [K in Kind]: (p: Payloads[K]) => string } = {
  "banking-approved": (p) => `banking.approved_${p.npo_id}`,
  "banking-default": (p) => `banking.default_${p.npo_id}`,
  "banking-new": (p) => `banking.new_${p.npo_id}`,
  "banking-rejected": (p) => `banking.rejected_${p.npo_id}`,
  "don-dist": (p) => `don.dist_${p.id}_${p.to_id}`,
  "don-sttl-dist": (p) => `don.sttl-dist_${p.id}`,
  "don-sttl-receipt": (p) => `don.sttl-receipt_${p.id}`,
  "fund-member-removed": (p) => `fund.removed_${p.fund_id}_${p.creator_id}`,
  "invite-email": (p) => `invite_${p.invitee}`,
  "lock-tx-created": (p) =>
    `lock_tx_${p.npo_id}_${String(p.date_created).replace(/:/g, "")}`,
  "reg-created": (p) => `reg.created_${p.id}`,
  "reg-updated": (p) => `reg.updated_${p.id}_${Date.now()}`,
  "sub-deactivated": (p) => `sub.deactivated_${p.id}`,
  "tip-received": (p) => `tip_${p.id}`,
};

export const msg = <K extends Kind>(kind: K, payload: MsgInput<K>): IMsg => ({
  id: kind,
  payload,
  dedupe: (dedupe[kind] as (p: MsgInput<K>) => string)(payload),
});

// runtime enumeration of every Kind, sourced from the dedupe map (which is
// itself exhaustiveness-enforced by `{ [K in Kind]: ... }`). use in tests
// instead of hand-maintained kind lists.
export const KINDS = Object.keys(dedupe) as Kind[];
