import { Image } from "@better-giving/ui";
import { Check } from "lucide-react";
import type { CSSProperties } from "react";
import laira_gift from "#/assets/laira/laira-gift.webp";

const points = [
  "Simpler Form 990: one pooled grant instead of hundreds of records",
  "Automatic branded tax receipts to every donor",
  "Stock & crypto liquidated for you: cash lands in your bank",
  "No juggling processor accounts; reduced PCI & compliance scope",
  "Full donor-level data, always yours to export",
] as const;

interface IMembershipAdvantage {
  /** the ground comes from here — the inks below are `surface-deep`'s set */
  classes?: string;
}

export function MembershipAdvantage({ classes = "" }: IMembershipAdvantage) {
  return (
    <section
      className={`${classes} relative isolate overflow-hidden`}
      aria-labelledby="membership-heading"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 dot-grid dot-grid-fade"
      />
      <div className="page grid gap-14 lg:gap-20 lg:grid-cols-[1.1fr_0.9fr] items-center">
        <div className="grid gap-8">
          <div className="grid gap-5 reveal">
            <p className="eyebrow text-amber-6">The membership advantage</p>
            <h2 id="membership-heading" className="section-heading">
              We do the admin.
              <br />
              <em className="text-amber-6">You keep the relationships.</em>
            </h2>
            <p className="text-blue-5 text-lg/relaxed text-pretty max-w-xl">
              On the managed platform, donations flow through Better Giving as a
              single 501(c)(3) grantor and are granted out to you, which makes
              your back office dramatically simpler, while you still receive
              full donor-level data for outreach and retention.
            </p>
          </div>
          <ul className="grid gap-3.5 font-medium">
            {points.map((p, i) => (
              <li
                key={p}
                className="flex items-start gap-3 reveal"
                style={
                  { "--reveal-order": Math.min(i + 1, 3) } as CSSProperties
                }
              >
                <span
                  className="flex-none size-6 rounded-full bg-success text-success-fg grid place-items-center"
                  aria-hidden="true"
                >
                  <Check className="icon-sm" strokeWidth={3} />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <span className="relative grid place-items-center justify-self-center">
          {/* the same halo the cta band spends behind its Laira */}
          <span
            className="absolute size-72 lg:size-96 max-w-full bg-radial from-blue-8 to-transparent to-60%"
            aria-hidden="true"
          />
          <Image
            src={laira_gift}
            width={320}
            alt="Laira holding a gift"
            className="relative w-48 md:w-64 lg:w-80 h-auto"
          />
        </span>
      </div>
    </section>
  );
}
