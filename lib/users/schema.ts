import * as v from "valibot";
import { $ } from "../schemas";

const user_update = v.object({
  pref_currency: v.optional(v.pipe($, v.toLowerCase(), v.minLength(3))),
  first_name: v.optional(v.pipe($, v.minLength(1))),
  last_name: v.optional(v.pipe($, v.minLength(1))),
  avatar_url: v.optional(v.pipe($, v.url())),
  pay_min: v.optional(v.pipe(v.number(), v.minValue(50))),
});

export const alert_pref = v.object({
  banking: v.optional(v.boolean()),
  donation: v.optional(v.boolean()),
});

export interface IAlertPref extends v.InferOutput<typeof alert_pref> {}

export interface IUserUpdate extends v.InferOutput<typeof user_update> {}
export interface IUser extends Required<IUserUpdate> {}
export interface IUserDb extends IUser {
  /** use for deduplication only */
  username: string;
  email: string;
  referral_code: string;
  client_id: string;
  /** iso date string */
  signup_date: string;
  /** @legacy */
  hubspot_contact?: string;
  /** @legacy */
  wallet_idx?: number;

  /** wise recipient id */
  pay_id?: string;
  /** weld data eid of signed w9 or w8ben */
  w_form?: string;
}

const userxnpo_update = v.object({
  /** for particular endow-id
   *  if no preference, send alert */
  alert_pref: v.optional(alert_pref),
});

export interface IUserXNpoUpdate
  extends v.InferOutput<typeof userxnpo_update> {}

const email = v.pipe($, v.toLowerCase(), v.email());

const invite = v.object({
  invitee: email,
  invitee_first_name: v.pipe($, v.minLength(1)),
  invitor: email,
  npo_name: v.pipe($, v.minLength(1)),
});

export interface IInviteNew extends v.InferOutput<typeof invite> {}

export interface IUserXNpo extends IUserXNpoUpdate {
  npo: number;
  /** user email */
  user: string;
}

export interface IUserXFund {
  fund_id: string;
  /** user email */
  user: string;
}
