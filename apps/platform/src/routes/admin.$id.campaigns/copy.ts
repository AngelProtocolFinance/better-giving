export const STATUS_WORD = {
  draft: "Draft",
  live: "Live",
  ended: "Ended",
} as const;

export function fund_row_status(row: { active: boolean; published: boolean }) {
  if (!row.active) return STATUS_WORD.ended;
  if (row.published) return STATUS_WORD.live;
  return STATUS_WORD.draft;
}

export const SLUG_LOCK_NOTE =
  "The address is locked. Changing it would break links that already point here.";

export const ORG_SLUG_PROMPT =
  "Set your organization slug on Organization before creating a campaign.";

const SLUG_TAKEN = "That address is already used by another campaign.";

export function slug_taken_message() {
  return SLUG_TAKEN;
}
