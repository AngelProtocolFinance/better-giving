import * as v from "valibot";
import { donation_source, donor_title } from "../donation/schema";
import { $, $int_gte1, $req, frequency } from "../schemas";

const vias = ["card", "bank", "crypto", "chariot", "paypal"] as const;

const via = v.picklist(vias);
/** used in client validation */
const donor_address_fv_raw = v.object({
  street: $req,
  city: $req,
  state: $,
  zip_code: $req,
  /** country name */
  country: $req,
  uk_gift_aid: v.optional(v.boolean()),
});

/** used in server validation, where requestor might not have all the information (e.g .express checkouts) */
const donor_address = v.object({
  street: v.optional($),
  city: v.optional($),
  state: v.optional($),
  zip_code: v.optional($),
  /** country name */
  country: v.optional($),
  uk_gift_aid: v.optional(v.boolean()),
});

export interface IDonorAddress extends v.InferOutput<typeof donor_address> {}

const donor_address_fv = v.pipe(
  donor_address_fv_raw,
  v.forward(
    v.partialCheck(
      [["country"], ["state"]],
      ({ country: c, state: s }) => {
        if (/united states/i.test(c)) {
          return s.trim().length > 0;
        }
        return true;
      },
      "required"
    ),
    ["state"]
  )
);

export interface IDonorAddressFv
  extends v.InferOutput<typeof donor_address_fv_raw> {}

export const donor_address_fv_init: IDonorAddressFv = {
  street: "",
  city: "",
  state: "",
  zip_code: "",
  country: "",
};

export const donor_public_msg_max_length = 500;
export const donor_public_msg = v.pipe(
  $req,
  v.maxLength(
    donor_public_msg_max_length,
    (x) => `max ${x.requirement} characters`
  )
);
export const donor_msg_to_npo_max_length = 500;
export const donor_msg_to_npo = v.pipe(
  $req,
  v.maxLength(
    donor_msg_to_npo_max_length,
    (x) => `max ${x.requirement} characters`
  )
);
/** used in client validation */
export const donor_fv = v.object({
  email: v.pipe($req, v.email("Please check your email for correctness")),
  title: donor_title,
  first_name: $req,
  last_name: $req,
  company_name: v.optional($),
  address: v.optional(donor_address_fv),
});
export interface IDonorFv extends v.InferOutput<typeof donor_fv> {}
/** used in server validation, where requestor might not have all the information (e.g .express checkouts) */
const donor = v.object({
  email: v.pipe(
    $,
    v.email("Please check your email for correctness"),
    v.toLowerCase()
  ),
  title: v.optional(donor_title),
  first_name: v.optional($),
  last_name: v.optional($),
  company_name: v.optional($),
  // only email is required
  address: v.optional(donor_address),
});

export interface IDonor extends v.InferOutput<typeof donor> {}

export const donor_fv_blank: IDonorFv = {
  title: "",
  first_name: "",
  last_name: "",
  email: "",
};
export const PLACEHOLDER_EMAIL = "hi@better.giving";

export const donor_fv_init: IDonorFv = {
  title: "",
  first_name: "unknown",
  last_name: "unknown",
  email: PLACEHOLDER_EMAIL,
};

const money = v.pipe(v.number(), v.minValue(0));

const amount = v.object({
  base: money,
  tip: money,
  fee_allowance: money,
});

export interface IAmount extends v.InferOutput<typeof amount> {}

const uuid = v.pipe($, v.uuid());

const program = v.object({
  id: uuid,
  name: $req,
});

export interface IProgram extends v.InferOutput<typeof program> {}

const to_id = v.union([$int_gte1, uuid]);

export const from_msg_max_length = 250;
const tribute_notif = v.object({
  to_email: v.pipe($req, v.email("invalid email")),
  to_fullname: $req,
  from_msg: v.pipe(
    $,
    v.maxLength(from_msg_max_length, (x) => `max ${x.requirement} characters`)
  ),
});

export const tribute = v.object({
  full_name: $req,
  notif: v.optional(tribute_notif),
});

export type ITribute = v.InferOutput<typeof tribute>;

export const intent = v.object({
  via,
  /** chariot:workflow-session-id, stripe: verify_urls etc. */
  via_extra: $,
  amount,
  currency: v.pipe($req, v.toUpperCase()),
  to_id,
  program: v.optional(program),
  donor,
  source: donation_source,
  form_id: v.optional($req),
  frequency,
});

export interface IDonationIntent extends v.InferOutput<typeof intent> {}

export interface IStripeIntentReturn {
  client_secret: string;
  order_id: string;
}
