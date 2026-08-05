import * as v from "valibot";
import {
  donor_msg_to_npo,
  donor_public_msg,
  tribute,
} from "@/donations/schema";
export const tribute_fv = v.object({
  type: v.literal("tribute"),
  ...tribute.entries,
});

export const public_msg_fv = v.object({
  type: v.literal("public_msg"),
  msg: donor_public_msg,
});
export interface IPublicMsgFv extends v.InferOutput<typeof public_msg_fv> {}

export const private_msg_fv = v.object({
  type: v.literal("private_msg"),
  msg: donor_msg_to_npo,
});

export interface IPrivateMsgFv extends v.InferOutput<typeof private_msg_fv> {}

export const company_name_max_length = 120;
export const employer_fv = v.object({
  type: v.literal("employer"),
  // free text by design — nothing anywhere knows whether a given employer runs
  // a matching programme, so there is no list to pick from and no name that
  // could be rejected as "not one of ours".
  company_name: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Please enter your employer"),
    v.maxLength(
      company_name_max_length,
      (x) => `max ${x.requirement} characters`
    )
  ),
});

export interface IEmployerFv extends v.InferOutput<typeof employer_fv> {}

/**
 * the donor telling us they filed a matching-gift claim.
 *
 * carries nothing but its discriminant on purpose. the donation id is already
 * in the url and is a random uuid — the page is a capability url, and the
 * action's existing cookie/session check is the rest of the auth story. there
 * is nothing else the donor could tell us here that we'd trust: an employer
 * confirms a claim by verifying with us, never by the donor typing something.
 */
export const filed_fv = v.object({ type: v.literal("filed") });

export interface IFiledFv extends v.InferOutput<typeof filed_fv> {}

export const schema = v.variant("type", [
  tribute_fv,
  private_msg_fv,
  public_msg_fv,
  employer_fv,
  filed_fv,
]);

export interface TributeFv extends v.InferOutput<typeof tribute_fv> {}
export type Schema = v.InferOutput<typeof schema>;
