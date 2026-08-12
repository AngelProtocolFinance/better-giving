import type { IReg, Progress } from "@/reg";

/** step numbers mean the same thing for everyone. step 3 is the only
 * conditional one — a 501(c)(3) has no fiscal-sponsorship agreement to sign
 * and crosses 2 → 4. */
export const steps = {
  contact: "1",
  org_details: "2",
  fsa: "3",
  banking: "4",
  summary: "5",
};

export const next_step: { [K in Progress["step"]]: string } = {
  1: steps.org_details,
  2: steps.fsa,
  3: steps.banking,
  4: steps.summary,
  5: steps.summary,
};

/** where org details hands off to — the branch point of the whole wizard */
export const after_org = (o_type: IReg["o_type"]) =>
  o_type === "501c3" ? steps.banking : steps.fsa;

/** the mirror of `after_org`: what "Back" from banking means */
export const before_banking = (o_type: IReg["o_type"]) =>
  o_type === "501c3" ? steps.org_details : steps.fsa;

export enum routes {
  /** org type + identity, and the resume strip — one screen */
  index = "",
  success = "success",
  sign_notice = "sign-notice",
  sign_result = "sign-result",
}
