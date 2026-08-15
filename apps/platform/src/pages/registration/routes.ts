import type { IReg, Progress, TRegUpdate } from "@/reg";

/** The one step a draft grant opens: the contact step, which a lead reaches
 * before the address is proven and which finishing is what asks for the proof.
 *
 * Three gates have to agree on it — the loader that decides whether to accept
 * a grant, the route that mounts the step, and the action that decides which
 * `update_type` a grant may write. They read these, so renumbering the wizard
 * moves all three or none. */
export const GRANT_STEP = 1 satisfies Progress["step"];
export const GRANT_UPDATE_TYPE = "contact" satisfies TRegUpdate["update_type"];

/** step numbers mean the same thing for everyone. step 3 is the only
 * conditional one — a 501(c)(3) has no fiscal-sponsorship agreement to sign
 * and crosses 2 → 4. */
export const steps = {
  contact: `${GRANT_STEP}`,
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
  identity = "identity",
}

/** The children of `/register/:reg_id` a draft grant opens, by path. Everything
 * else under that layout is session-only — the layout wraps them all, so
 * without naming them a child added to the subtree would inherit grant access
 * by doing nothing (`sign-result` already carries no loader of its own).
 *
 * The identity screen is here because it is the one correction a lead can still
 * need before proving the address: the summary above the contact step offers
 * "Change", and it is a dead end if they cannot follow it. */
export const grant_open: ReadonlySet<string> = new Set([
  steps.contact,
  routes.identity,
]);
