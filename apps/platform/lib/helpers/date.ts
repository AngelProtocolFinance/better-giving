import { endOfDay, format } from "date-fns";

export { endOfDay, startOfDay } from "date-fns";

import * as v from "valibot";

/** @see {@link https://date-fns.org/v4.1.0/docs/format} */
export function toPP(date: string | Date) {
  return format(new Date(date), "PP");
}

export const iso_date = (formatter: typeof endOfDay, required?: "required") =>
  v.lazy((x) => {
    if (!x) {
      return required === "required"
        ? v.pipe(v.string(), v.nonEmpty("required"))
        : v.string();
    }

    return v.pipe(
      v.string(),
      v.transform((v) => new Date(v)),
      v.date("invalid date"),
      v.maxValue(endOfDay(new Date()), "can't be later than today"),
      v.transform((x) => formatter(x).toISOString())
    );
  });

/**
 * calendar day in UTC. the receipt is stamped server-side, so a donation made
 * late in a western evening already reads as the next day there — formatting
 * the same instant in the donor's own zone would print a different date than
 * the document their employer verifies the claim against.
 */
export const to_utc_day = (date: string | Date) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(date));

export const to_pretty_utc = (date: string | Date) =>
  `${format(new Date(date), "yyyy-MM-dd HH:mm:ss")} (UTC)`;

export const YYYYMMDD = (date: Date | string) => {
  const d = new Date(date);
  return format(d, "yyyyMMdd");
};
