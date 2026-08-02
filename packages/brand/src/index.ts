/**
 * the 501(c)(3) that issues every receipt.
 *
 * these three are what a donor copies onto an employer's matching-gift form,
 * and what the employer verifies against IRS records — so the receipt, the
 * filing pack and the donation page must not be able to disagree about them.
 * `LEGAL_NAME` is the registered entity, which is what an "organization legal
 * name" field wants; "Better Giving" is the brand and stays in prose.
 */
export const LEGAL_NAME = "Better Giving, Inc.";
export const EIN = "87-3758939";
export const ADDRESS = "18 Cottekill Rd, Rosendale, NY 12472";

// canonical better giving social profile urls. single source of truth shared by
// platform (spread into its wider `socials` map alongside intercom) and the docs
// app footer.
export const socials = {
  facebook: "https://www.facebook.com/BetterGivingFB/",
  instagram: "https://www.instagram.com/better.giving",
  linkedin: "https://www.linkedin.com/company/better-giving/",
  x: "https://x.com/BetterDotGiving",
  youtube: "https://www.youtube.com/@BetterDotGiving",
};
