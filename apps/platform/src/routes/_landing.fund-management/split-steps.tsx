import type { CSSProperties } from "react";

const steps = [
  {
    step: "01",
    title: "Choose your split",
    body: "e.g. 80% granted to your bank, 15% savings, 5% Sustainability Fund. Whatever fits your needs.",
  },
  {
    step: "02",
    title: "Donations route automatically",
    body: "Every gift (card, stock, crypto, DAF) follows your split with no extra admin.",
  },
  {
    step: "03",
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
          className="section-heading text-center max-w-2xl mx-auto reveal"
        >
          Set your split once.{" "}
          <em className="text-primary">We handle the rest.</em>
        </h2>
        <div className="relative mt-16 md:mt-20">
          {/* the md+ connector, from the first medallion's centre to the
              last's; each medallion's own fill hides the line behind it */}
          <span
            aria-hidden="true"
            className="absolute top-14 left-1/6 right-1/6 border-t-2 border-dashed border-gray-7 max-md:hidden"
          />
          <ol className="grid gap-12 md:grid-cols-3 md:gap-8">
            {steps.map((s, i) => (
              <li
                key={s.step}
                className="reveal relative grid content-start grid-cols-[auto_1fr] gap-x-6 md:grid-cols-1 md:justify-items-center md:text-center"
                style={{ "--reveal-order": i } as CSSProperties}
              >
                {/* below md the connector runs down the medallion column, one
                  segment per gap: centre of this medallion to the next's */}
                {i < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute left-10 top-10 -bottom-22 border-l-2 border-dashed border-gray-7 md:hidden"
                  />
                )}
                <span
                  aria-hidden="true"
                  className="relative row-span-2 md:row-span-1 flex-center size-20 md:size-28 rounded-full border bg-surface display-figure text-4xl md:text-6xl text-primary"
                >
                  {s.step}
                </span>
                <h3 className="text-2xl font-bold text-balance self-center md:self-auto md:mt-8">
                  {s.title}
                </h3>
                <p className="mt-2 text-base/relaxed text-gray-11 text-pretty max-w-80">
                  {s.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
