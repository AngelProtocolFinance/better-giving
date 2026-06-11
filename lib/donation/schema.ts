import * as v from "valibot";
import { $int_gte1 } from "../schemas";
import { endOfDay, iso_date, startOfDay } from "../schemas/date";

const donation_sources = ["bg-marketplace", "bg-widget"] as const;

export const donation_source = v.picklist(donation_sources);
export type TDonationSource = v.InferOutput<typeof donation_source>;

const donor_titles = ["Mr", "Mrs", "Ms", "Mx", ""] as const;
export const donor_title = v.picklist(donor_titles);

export type TDonorTitle = v.InferOutput<typeof donor_title>;

const pct = v.pipe(v.number(), v.minValue(0), v.maxValue(100));
export const allocation = v.pipe(
  v.object({
    liq: pct,
    lock: pct,
    cash: pct,
  }),
  v.check((x) => x.liq + x.lock + x.cash === 100, "Allocation must sum to 100%")
);

export type IAllocation = v.InferOutput<typeof allocation>;

export const page_opts = v.object({
  limit: v.optional($int_gte1),
  next: v.optional(v.string()),
});

export interface IPageOpts extends v.InferOutput<typeof page_opts> {}

const donations_search_raw = v.object({
  ...page_opts.entries,
  date_start: v.optional(iso_date(startOfDay)),
  date_end: v.optional(iso_date(endOfDay)),
});

export const donations_search = v.pipe(
  donations_search_raw,
  v.forward(
    v.partialCheck(
      [["date_start"], ["date_end"]],
      ({ date_start: a, date_end: b }) => {
        return a && b ? a <= b : true;
      },
      "start date must be earlier than end date"
    ),
    ["date_start"]
  )
);

export interface IDonationsSearch
  extends v.InferOutput<typeof donations_search_raw> {}
