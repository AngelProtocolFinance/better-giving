import type { Except } from "type-fest";
import type { EndowDesignation, INposPage } from "@/npo";
import type { INpo } from "$/pg/queries/npo";

export interface EndowCardsPage
  extends INposPage<
    | "id"
    | "card_img"
    | "name"
    | "tagline"
    | "claimed"
    | "contributions_total"
    | "target"
  > {}
export interface EndowOptionsPage
  extends INposPage<"id" | "name" | "registration_number"> {}
export interface EndowFundMembersOptionsPage
  extends INposPage<"id" | "name" | "card_img" | "registration_number"> {}

export type EndowmentCard = EndowCardsPage["items"][number];
export type EndowmentOption = EndowOptionsPage["items"][number];
export type EndowmentSettingsAttributes = keyof Pick<
  INpo,
  | "receipt_msg"
  | "hide_bg_tip"
  | "prog_donations_allowed"
  | "donate_methods"
  | "increments"
  | "fund_opt_in"
  | "target"
  | "donor_address_required"
  | "donate_frequencies"
>;

//most are optional except id, but typed as required to force setting of default values - "", [], etc ..
export type EndowmentProfileUpdate = Except<
  Required<INpo>,
  | "endow_designation"
  | "fiscal_sponsored"
  | "claimed"
  | "allocation"
  | "kyc_donors_only"
  | EndowmentSettingsAttributes
> & {
  endow_designation: EndowDesignation | "";
};

export type EndowmentSettingsUpdate = Pick<
  Required<INpo>,
  EndowmentSettingsAttributes
>;
export type EndowmentAllocationUpdate = Pick<Required<INpo>, "allocation">;
