import { KeyRound, ScanSearch, Sprout } from "lucide-react";
import type { CSSProperties } from "react";

const reasons = [
  {
    title: "Verify, don't trust",
    Icon: ScanSearch,
    body: "Anyone (your board, your auditor, your most skeptical donor) can inspect exactly how donations are processed, routed, and receipted.",
  },
  {
    title: "Own your independence",
    Icon: KeyRound,
    body: "Self-host the donation form with your own payment gateway and merchant account. Your donor tokens never leave your control. Nothing to migrate, ever.",
  },
  {
    title: "A commons that outlives us",
    Icon: Sprout,
    body: "Public code can't be bought, gated, or shut away. The community keeps the infrastructure free for every nonprofit, forever.",
  },
] as const;

interface IWhy {
  classes?: string;
}

export function Why({ classes = "" }: IWhy) {
  return (
    <section className={classes} aria-labelledby="why-heading">
      <div className="page">
        <h2
          id="why-heading"
          className="section-heading text-center max-w-2xl mx-auto reveal"
        >
          Why an <em className="text-primary">open-source commons?</em>
        </h2>
        <ul className="mt-14 md:mt-20 grid gap-6 md:grid-cols-3">
          {reasons.map(({ title, Icon, body }, i) => (
            <li
              key={title}
              className="card reveal grid content-start gap-3"
              style={{ "--reveal-order": i } as CSSProperties}
            >
              <span
                aria-hidden="true"
                className="size-14 rounded-full border bg-surface text-primary grid place-items-center"
              >
                <Icon className="pictogram-sm" strokeWidth={1.5} />
              </span>
              <h3 className="mt-3 text-xl font-bold text-gray-12 text-balance">
                {title}
              </h3>
              <p className="text-base/relaxed text-gray-11 text-pretty">
                {body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
