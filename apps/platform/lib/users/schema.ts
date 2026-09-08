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
  /** document-group eid of the signed w9 or w8ben. the weld-data eid the form
   * was minted from is a separate column this type does not declare, and
   * `user_get`/`user_by_referral_code` project it away — read it through
   * `user_w_form_weld_eid` */
  w_form?: string;
}

/**
 * a `user` row as `user_get`/`user_by_referral_code` actually return it —
 * `IUserDb` is what a validated *write* looks like, and the two disagree.
 *
 * nullability mirrors the table column-for-column, `referral_code`,
 * `pref_currency` and `pay_min` included. better-auth's defaults and the
 * `user.create.after` hook do fill those three on every row, and staging (2684
 * rows) carries no null in any of them — so a caller that reads one
 * non-null-asserts it at the point of use. that assumption lives at the few
 * call sites it holds for rather than in this type: 9+ readers share it, and
 * only a handful touch those three columns at all.
 */
export interface IUserRow {
  email: string;
  first_name: string;
  last_name: string;
  referral_code: string | null;
  pref_currency: string | null;
  pay_min: number | null;
  avatar_url: string | null;
  /** iso date string */
  signup_date: string | null;
  /** wise recipient id */
  pay_id: string | null;
  /** document-group eid of the signed w9 or w8ben */
  w_form: string | null;
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
