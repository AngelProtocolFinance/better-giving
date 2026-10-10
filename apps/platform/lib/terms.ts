/** the day the nonprofit, donor and referral terms' recovery right takes
 * effect: 7 days after their posting. it begins at midnight in New York
 * (`TERMS_ZONE`); `terms_effective_at` turns it into that instant */
export const TERMS_EFFECTIVE = "2026-10-16";

export const TERMS_ZONE = "America/New_York";

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `date`'s midnight in utc, in ms; null when `date` is not a calendar date */
function utc_midnight_of(date: string): number | null {
  const m = CALENDAR_DATE.exec(date);
  if (!m) return null;
  const [y, mo, d] = [m[1], m[2], m[3]].map(Number) as [number, number, number];
  const utc_midnight = Date.UTC(y, mo - 1, d);
  // Date.UTC rolls 2026-02-30 over into march rather than rejecting it
  const day = new Date(utc_midnight);
  if (day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== d) return null;
  return utc_midnight;
}

/** `date`'s midnight in `TERMS_ZONE`, as an ISO instant; null when `date` is
 * not a calendar date */
export function terms_effective_at(date: string): string | null {
  const utc_midnight = utc_midnight_of(date);
  if (utc_midnight == null) return null;
  // utc midnight is the evening before in New York, and its clocks change at
  // 2am, so the offset then is the offset at that night's midnight
  return new Date(utc_midnight - zone_offset_ms(utc_midnight)).toISOString();
}

const long_date = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "UTC",
});

/** `date` as the terms print it ("October 16, 2026"), the same calendar day
 * in every zone; a non-date comes back as given */
export function terms_date_label(date: string): string {
  const utc_midnight = utc_midnight_of(date);
  return utc_midnight == null ? date : long_date.format(utc_midnight);
}

const zone_clock = new Intl.DateTimeFormat("en-US", {
  timeZone: TERMS_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** how far `TERMS_ZONE`'s wall clock runs ahead of utc at `t` */
function zone_offset_ms(t: number): number {
  const part = Object.fromEntries(
    zone_clock.formatToParts(t).map((p) => [p.type, Number(p.value)])
  );
  const wall = Date.UTC(
    part.year!,
    part.month! - 1,
    part.day!,
    part.hour!,
    part.minute!,
    part.second!
  );
  return wall - t;
}
