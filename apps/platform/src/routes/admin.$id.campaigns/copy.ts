export const SLUG_LOCK_NOTE =
  "The address is locked. Changing it would break links that already point here.";

export const ORG_SLUG_PROMPT =
  "Set your organization slug on Organization before creating a campaign.";

const SLUG_TAKEN = "That address is already used by another campaign.";

export function slug_taken_message() {
  return SLUG_TAKEN;
}
