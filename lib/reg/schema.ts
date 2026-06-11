import { $, $req, https_url, org_designation } from "../schemas";
import { person_name } from "../schemas/person-name";

export type { OrgDesignation as EndowDesignation, UnSdgNum } from "../schemas";

import * as v from "valibot";
import { max_date, min_date } from "./constants";

const npo_claim = v.object({
  id: v.number(),
  name: $,
  /** lowercase */
  ein: v.pipe($req, v.toLowerCase()),
});
export interface INpoClaim extends v.InferOutput<typeof npo_claim> {}

const org_roles = [
  "president",
  "vice-president",
  "secretary",
  "treasurer",
  "ceo",
  "cfo",
  "board-member",
  "leadership-team",
  "fundraising-finance",
  "legal",
  "communications",
  "other",
  "executive-director",
] as const;
export const org_role = v.picklist(org_roles, "required");
export type TRole = v.InferOutput<typeof org_role>;

const referral_methods = [
  "referral",
  "better-giving-alliance",
  "discord",
  "facebook",
  "linkedin",
  "medium",
  "press",
  "search-engines",
  "twitter",
  "other",
] as const;

const url = v.pipe($req, v.url("invalid url"));
export const referral_method = v.picklist(referral_methods, "required");
export type TReferralMethod = v.InferOutput<typeof referral_method>;

export const reg_id = v.pipe($, v.uuid("invalid reference number"));

/**
 * 01 - in-progress
 * 02 - in-review
 * 03 - approved
 * 04 - rejected
 */
const statuses = ["01", "02", "03", "04"] as const;
export const status = v.picklist(statuses);
export type TStatus = v.InferOutput<typeof status>;

/**
 * 01 - in-progress
 * 02 - in-review
 * 03 - approved
 * 04 - rejected
 */

export const reg_new = v.object({
  r_id: v.pipe($req, v.toLowerCase(), v.email()),
  claim: v.optional(npo_claim),
  referrer: v.optional($req),
});

export interface IRegInternal {
  id: string;
  created_at: string;
  updated_at: string;
  /** @deprecated */
  env?: never;
}

const o_project_description_max_length = 4000;
export const fsa_docs_fv = v.object({
  o_registration_number: v.pipe($req, v.toLowerCase()),
  o_legal_entity_type: $req,
  o_project_description: v.pipe(
    $req,
    v.maxLength(
      o_project_description_max_length,
      ({ requirement }) => `can't be more than ${requirement} chars`
    )
  ),
});

const fsa_docs = v.object({
  ...fsa_docs_fv.entries,
  r_proof_of_identity: url,
  o_proof_of_reg: url,
});

export interface IFsaDocs extends v.InferOutput<typeof fsa_docs> {}
export interface IRegNew extends v.InferOutput<typeof reg_new> {}

const ein = v.pipe(
  $req,
  v.toLowerCase(),
  v.regex(/^[a-zA-Z0-9]+$/, "can only contain letters and numbers")
);

const org_types = ["501c3", "other"] as const;
const org_type = v.picklist(org_types);
export const _update_contact_fv = v.object({
  r_first_name: person_name,
  r_last_name: person_name,
  r_contact_number: v.optional($),
  r_org_role: org_role,
  r_org_role_other: v.optional($req),
  rm: referral_method,
  /** when `referral_method = "referral"` : may be empty */
  rm_referral_code: v.optional($),
  /** when `referral_method = "other"` : may be empty */
  rm_other: v.optional($),
  o_name: $req,
});

const _update_contact = v.object({
  update_type: v.literal("contact"),
  ...v.partial(_update_contact_fv).entries,
});

export interface IUpdateContact extends v.InferOutput<typeof _update_contact> {}

const update_contact = v.pipe(
  _update_contact,
  // referral method - referral
  v.forward(
    v.partialCheck(
      [["rm"], ["rm_referral_code"]],
      (i) => (i.rm === "referral" ? !!i.rm_referral_code : true),
      "required"
    ),
    ["rm_referral_code"]
  ),
  // referral method - other
  v.forward(
    v.partialCheck(
      [["rm"], ["rm_other"]],
      (i) => (i.rm === "other" ? !!i.rm_other : true),
      "required"
    ),
    ["rm_other"]
  ),
  // org role other
  v.forward(
    v.partialCheck(
      [["r_org_role"], ["r_org_role_other"]],
      (i) => (i.r_org_role === "other" ? !!i.r_org_role_other : true),
      "required"
    ),
    ["r_org_role_other"]
  )
);

export const update_org_fv = v.object({
  o_website: https_url({ required: true }),
  o_hq_country: $req,
  o_active_in_countries: v.optional(v.array($)),
  o_designation: org_designation,
});

const update_org = v.object({
  update_type: v.literal("org"),
  ...v.partial(update_org_fv).entries,
  /** @deprecated */
  o_kyc_donors_only: v.optional(v.boolean()),
  /** @deprecated */
  o_un_sdg: v.optional(v.array(v.number())),
});

export interface IUpdateOrg extends v.InferOutput<typeof update_org> {}

const update_org_type_fv = v.object({
  o_type: org_type,
});

const update_org_type = v.object({
  update_type: v.literal("org_type"),
  ...v.partial(update_org_type_fv).entries,
});
export interface IUpdateOrgType extends v.InferOutput<typeof update_org_type> {}

const update_fsa_docs = v.object({
  update_type: v.literal("fsa-doc"),
  ...v.partial(fsa_docs).entries,
});
export interface IUpdateFsaDocs extends v.InferOutput<typeof update_fsa_docs> {}

export const update_ein_fv = v.object({
  o_ein: ein,
});

const update_ein = v.object({
  update_type: v.literal("ein"),
  ...v.partial(update_ein_fv).entries,
  claim: v.optional(npo_claim),
});
export interface IUpdateEin extends v.InferOutput<typeof update_ein> {}

const update_bank_fv = v.object({
  /** wise recipient id */
  o_bank_id: $req,
  o_bank_statement: url,
});

const update_bank = v.object({
  update_type: v.literal("banking"),
  ...v.partial(update_bank_fv).entries,
});

export interface IUpdateBank extends v.InferOutput<typeof update_bank> {}

export const reg_update = v.variant("update_type", [
  update_contact,
  update_org,
  update_org_type,
  update_fsa_docs,
  update_ein,
  update_bank,
]);

export type TRegUpdate = v.InferOutput<typeof reg_update>;

type Attr<T extends { update_type: string }> = Omit<T, "update_type">;

export interface IRegUpdateables
  extends Attr<IUpdateContact>,
    Attr<IUpdateOrg>,
    Attr<IUpdateOrgType>,
    Attr<IUpdateFsaDocs>,
    Attr<IUpdateEin>,
    Attr<IUpdateBank> {
  status_rejected_reason?: string;
}

export interface IRegUpdateInternal {
  o_fsa_signing_url?: string;
  o_fsa_signed_doc_url?: string;
  status: TStatus;
  status_approved_npo_id?: number;
}

export interface IReg
  extends IRegUpdateables,
    IRegUpdateInternal,
    IRegNew,
    IRegInternal {}

export const regs_sort_key = v.picklist([
  "o_name",
  "updated_at",
  "o_hq_country",
  "status",
]);
export type TRegsSortKey = v.InferOutput<typeof regs_sort_key>;

export const regs_search = v.pipe(
  v.object({
    next: v.optional(v.string()),
    query: v.optional(v.pipe(v.string(), v.maxLength(100))),
    country: v.optional(v.string()),
    start_date: v.optional(
      v.pipe(v.string(), v.isoTimestamp(), v.minValue(min_date))
    ),
    end_date: v.optional(
      v.pipe(v.string(), v.isoTimestamp(), v.maxValue(max_date))
    ),
    status: v.optional(v.union([v.literal(""), status])),
    sort_key: v.optional(regs_sort_key),
    sort_dir: v.optional(v.picklist(["asc", "desc"])),
  }),
  v.check((x) => {
    if (x.start_date && x.end_date) {
      return x.start_date <= x.end_date;
    }
    return true;
  }, "start date must be less than end date")
);

export interface IRegsSearch extends v.InferInput<typeof regs_search> {}
export interface IRegsSearchObj extends v.InferOutput<typeof regs_search> {}

export const fsa_docs_or_signer = v.union([fsa_docs, $req /** signer eid */]);
