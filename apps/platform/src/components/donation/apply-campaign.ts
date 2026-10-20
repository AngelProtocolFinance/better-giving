import type { IDonationIntent } from "@/donations";
import type { Config } from "./types";

/** copies a campaign page's id onto the intent; other forms leave it off */
export function apply_campaign<T extends IDonationIntent>(
  intent: T,
  config: Config | null | undefined
): T {
  if (config?.campaign_id) intent.campaign_id = config.campaign_id;
  return intent;
}
