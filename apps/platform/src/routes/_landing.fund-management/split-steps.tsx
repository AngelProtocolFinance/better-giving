import type { CSSProperties } from "react";

const steps = [
  {
    title: "Choose your split",
    body: "e.g. 80% granted to your bank, 15% savings, 5% Sustainability Fund. Whatever fits your needs.",
  },
  {
    title: "Donations route automatically",
    body: "Every gift (card, stock, crypto, DAF) follows your split with no extra admin.",
  },
  {
    title: "Watch reserves build",
    body: "Track balances in your dashboard and withdraw anytime. Payouts within 5 working days.",
  },
] as const;

interface ISplitSteps {
  classes?: string;
}

export function SplitSteps({ classes = "" }: ISplitSteps) {
  return (
    <section className={classes} aria-labelledby="split-steps-heading">
      <div className="page">
        <h2
          id="split-steps-heading"
          className="section-heading max-w-2xl reveal"
        >
          Set your split once. We handle the rest.
        </h2>
        {/* order is the row's left-to-right and the list's own numbering */}
        <ol className="mt-14 md:mt-16 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className="tile reveal grid content-start gap-3"
              style={{ "--reveal-order": i } as CSSProperties}
            >
              <h3 className="subsection-heading">{s.title}</h3>
              <p className="text-base/relaxed text-gray-11 text-pretty">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
