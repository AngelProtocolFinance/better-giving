import { Check } from "lucide-react";

const items = [
  "Instant U.S. tax-deductible receipts for every donor",
  "Due diligence and vetting handled by our team",
  "Form 990 and IRS reporting covered",
  "Donor records and data belong to you",
  "Every payout tracked in your dashboard",
] as const;

export function Paperwork({ classes = "" }) {
  return (
    <section className={classes}>
      <div className="page grid gap-10 md:gap-12 md:grid-cols-2 items-start">
        <div className="grid gap-3 content-start">
          <h2 className="article-heading">
            You fundraise. We do the paperwork.
          </h2>
          <p className="text-base/relaxed text-gray-11 text-pretty">
            Everything a U.S. donor expects, and everything the IRS requires,
            handled on your behalf.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
          {/* ticks are start-aligned, not centered: these wrap to two lines on
              narrow screens and a centered tick drifts off the first line */}
          {items.map((i) => (
            <li
              key={i}
              className="flex items-start gap-2.5 bg-card border border-gray-6 rounded px-4 py-3.5 text-sm/relaxed"
            >
              <Check
                size={16}
                className="shrink-0 text-success mt-0.5"
                aria-hidden
              />
              {i}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
