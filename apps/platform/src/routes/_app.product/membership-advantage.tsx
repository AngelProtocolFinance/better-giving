import { Check } from "lucide-react";
import type { CSSProperties } from "react";

const points = [
  "Automatic branded tax receipts to every donor",
  "We accept stock and crypto gifts",
  "Card data handled by Stripe (PCI SAQ A)",
  "Full donor-level data, always yours to export",
] as const;

interface IMembershipAdvantage {
  /** the ground comes from here — the inks below are `surface-deep`'s set */
  classes?: string;
}

export function MembershipAdvantage({ classes = "" }: IMembershipAdvantage) {
  return (
    <section className={classes} aria-labelledby="membership-heading">
      <div className="page grid gap-12 lg:gap-20 lg:grid-cols-2 items-center">
        <div className="grid gap-5 reveal">
          <h2 id="membership-heading" className="section-heading">
            We do the admin.
            <br />
            You keep the relationships.
          </h2>
          <p className="text-blue-5 text-lg/relaxed text-pretty max-w-xl">
            On the managed platform, donations flow through Better Giving as a
            single 501(c)(3) grantor and are granted out to you, which makes
            your back office dramatically simpler, while you still receive full
            donor-level data for outreach and retention.
          </p>
        </div>
        <ul className="grid gap-5 text-lg/relaxed font-medium">
          {points.map((p, i) => (
            <li
              key={p}
              className="flex items-start gap-4 reveal"
              style={{ "--reveal-order": Math.min(i, 3) } as CSSProperties}
            >
              <span
                className="flex-none mt-0.5 size-7 rounded-full bg-success text-success-fg grid place-items-center"
                aria-hidden="true"
              >
                <Check className="icon-md" strokeWidth={3} />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
