import { smart_next } from "@better-giving/ui";
import type { TCampaignType } from "@/campaign";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const TAG: Record<TCampaignType, string | null> = {
  year_end: "Year-end",
  emergency: "Emergency",
  building: "Building",
  event: "Event",
  tribute: "Tribute",
  monthly: "Monthly",
  program: "Program",
  other: null,
};

export function tag_label(type: string | null): string | null {
  if (!type) return null;
  if (!(type in TAG)) return null;
  return TAG[type as TCampaignType];
}

/** fixed goal, or the next smart rung. null when the campaign has no goal. */
export function goal_amount(
  target: string | undefined,
  raised: number
): number | null {
  if (!target || target === "0") return null;
  const to = target === "smart" ? smart_next(raised) : Number(target);
  if (!(to > 0) || Number.isNaN(to) || Number.isNaN(raised)) return null;
  return to;
}

/** keeps counting past 100. the bar caps on its own. */
export function goal_percent(raised: number, goal: number): number {
  if (!(goal > 0) || Number.isNaN(raised)) return 0;
  return Math.floor((raised / goal) * 100);
}

export function donor_label(n: number): string {
  if (n === 1) return "1 donor";
  return `${n.toLocaleString("en-US")} donors`;
}

const ended_date = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function format_ended_date(ends_at: string): string {
  return ended_date.format(new Date(ends_at));
}

export function ended_label(ends_at: string | null): string {
  if (!ends_at) return "Ended";
  return `Ended ${format_ended_date(ends_at)}`;
}

export function closed_body(ends_at: string | null): string {
  if (!ends_at) {
    return "It no longer takes donations. Thank you to everyone who gave.";
  }
  return `It stopped taking donations on ${format_ended_date(ends_at)}. Thank you to everyone who gave.`;
}

/** null once the end has passed. the caller shows the ended label instead. */
export function time_left(ends_at: string, now: Date): string | null {
  const ms = new Date(ends_at).getTime() - now.getTime();
  if (!(ms > 0)) return null;
  if (ms < HOUR) return "Less than an hour left";
  if (ms < DAY) {
    const hours = Math.ceil(ms / HOUR);
    return hours === 1 ? "1 hour left" : `${hours} hours left`;
  }
  const days = Math.ceil(ms / DAY);
  return days === 1 ? "1 day left" : `${days} days left`;
}
