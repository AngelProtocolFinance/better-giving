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
    <div className={classes}>
      <h2 className="article-heading">You fundraise. We do the paperwork.</h2>
      <ul className="mt-4 bg-card border border-border rounded divide-y divide-border">
        {/* ticks are start-aligned, not centered: these wrap to two lines on
            narrow screens and a centered tick drifts off the first line */}
        {items.map((i) => (
          <li key={i} className="flex items-start gap-2.5 px-4 py-3 text-sm">
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
  );
}
