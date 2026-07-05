import { Check } from "lucide-react";
import laira_gift from "#/assets/laira/laira-gift.webp";
import { Image } from "#/components/image";

const points = [
  "Simpler Form 990: one pooled grant instead of hundreds of records",
  "Automatic branded tax receipts to every donor",
  "Stock & crypto liquidated for you: cash lands in your bank",
  "No juggling processor accounts; reduced PCI & compliance scope",
  "Full donor-level data, always yours to export",
] as const;

interface IMembershipAdvantage {
  classes?: string;
}

export function MembershipAdvantage({ classes = "" }: IMembershipAdvantage) {
  return (
    <section className={classes} aria-labelledby="membership-heading">
      <div className="max-w-6xl mx-auto grid gap-14 lg:grid-cols-[1.05fr_0.95fr] items-center">
        <div className="grid gap-4.5">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            The membership advantage
          </p>
          <h2
            id="membership-heading"
            className="section-heading text-primary-fg"
          >
            We do the admin. You keep the relationships.
          </h2>
          <p className="text-primary-fg/80 leading-relaxed text-pretty">
            On the managed platform, donations flow through Better Giving as a
            single 501(c)(3) grantor and are granted out to you, which makes
            your back office dramatically simpler, while you still receive full
            donor-level data for outreach and retention.
          </p>
          <div className="grid gap-2.5 text-primary-fg font-medium text-sm">
            {points.map((p) => (
              <span key={p} className="flex items-center gap-2.5">
                <span
                  className="flex-none size-5.5 rounded-full bg-success text-success-fg grid place-items-center"
                  aria-hidden
                >
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                {p}
              </span>
            ))}
          </div>
        </div>
        <Image
          src={laira_gift}
          width={360}
          alt="Laira holding a gift"
          className="justify-self-center max-w-full"
        />
      </div>
    </section>
  );
}
