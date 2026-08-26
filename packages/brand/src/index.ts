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
/**
 * the mailing address as a donor writes it on an envelope. the lines are the
 * source; `ADDRESS` is the one-line form the filing pack and the
 * copy-to-clipboard strings want, joined from them so the two cannot disagree.
 */
export const ADDRESS_LINES = [
  "18 Cottekill Rd",
  "Rosendale, NY 12472",
] as const;
export const ADDRESS = ADDRESS_LINES.join(", ");

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

/**
 * the inboxes a donor or nonprofit is told to write to. `hi` is the general
 * contact and also the From: address on every outgoing mail, so the line a
 * recipient replies to and the line the app prints have to name one inbox.
 * `support` is the one the marketing and account-recovery pages point at.
 */
export const EMAILS = {
  hi: "hi@better.giving",
  support: "support@better.giving",
} as const;
