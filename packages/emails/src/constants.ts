import { INTERCOM_HELP } from "@better-giving/brand";

export { EMAILS } from "@better-giving/brand";

const DOMAIN = "better.giving";
export const DAPP_URL = `https://${DOMAIN}`;
export const APP_NAME = "Better Giving";

// intercom deep links, named because a bare `/articles/7064094-how-do-we-…` in the
// middle of a template says nothing about which article it opens, and because
// four links scattered across three templates are worth having in one place.
export const HELP = {
  edit_overview: `${INTERCOM_HELP}/articles/7064094-how-do-we-edit-the-overview-on-our-better-giving-page`,
  embed_form: `${INTERCOM_HELP}/articles/7188194-add-a-donation-form-to-your-own-site`,
  personal_account_signin: `${INTERCOM_HELP}/articles/8791497-how-to-sign-in-to-a-better-giving-personal-account`,
  administering_account: `${INTERCOM_HELP}/collections/3700095-administering-my-better-giving-account`,
};
