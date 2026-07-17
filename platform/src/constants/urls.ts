import { base_url } from "./env";

export const PRIVACY_POLICY = `${base_url}/privacy-policy/`;
export const TERMS_OF_USE_NPO = `${base_url}/terms-of-use-npo/`;
export const TERMS_OF_USE_DONOR = `${base_url}/terms-of-use/`;
export const guidestar = {
  seal: "https://widgets.guidestar.org/prod/v1/pdp/transparency-seal/14574957/svg",
  profile:
    "https://app.candid.org/profile/14574957/better-giving-inc-87-3758939",
};

export const DEV_DOCS_BASE_URL = "https://developer.better.giving";
export const BOOK_A_DEMO =
  "https://meetings-eu1.hubspot.com/chauncey-st-john/better-giving-nonprofit-demo";
export const INTERCOM_HELP = "https://intercom.help/better-giving/en";
export const GITHUB_REPO =
  "https://github.com/AngelProtocolFinance/better-giving";

export const socials = {
  facebook: "https://www.facebook.com/BetterGivingFB/",
  instagram: "https://www.instagram.com/better.giving",
  linkedin: "https://www.linkedin.com/company/better-giving/",
  x: "https://x.com/BetterDotGiving",
  youtube: "https://www.youtube.com/@BetterDotGiving",
  intercom: INTERCOM_HELP,
};

export const referrals_hub =
  "https://intercom.help/better-giving/en/collections/13341032-referral-program-resource-hub ";

export const static_url = (path: string) =>
  `https://cnfc6hjkztdschkg.public.blob.vercel-storage.com/migrated/static/${path}`;
