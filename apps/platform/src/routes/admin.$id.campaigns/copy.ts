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

export const SLUG_HELP = "Letters, numbers, and - . _ ~";

export const SLUG_LOCK_NOTE =
  "This link is fixed because the campaign is published.";

export const SLUG_PUBLISH_LOCK = "The link can't change after you publish.";

export function publish_lock_body(link: string) {
  return `Donors will find this campaign at ${link}. The link can't change after you publish.`;
}

export const ORG_SLUG_PROMPT =
  "Set your organization slug on Organization before creating a campaign.";

const SLUG_TAKEN = "That link is already used by another campaign.";

export function slug_taken_message() {
  return SLUG_TAKEN;
}
