const allocation = [
  { pct: "50%", label: "U.S. equities", swatch: "bg-primary" },
  { pct: "10%", label: "non-U.S. equities", swatch: "bg-primary/65" },
  { pct: "32.5%", label: "fixed income", swatch: "bg-primary/30" },
  { pct: "7.5%", label: "metals", swatch: "bg-warning" },
] as const;

// conic segments mirror the legend swatches: token opacities ≈ white mixes
const donut_bg = `conic-gradient(
  var(--color-primary) 0% 50%,
  color-mix(in srgb, var(--color-primary) 65%, white) 50% 60%,
  color-mix(in srgb, var(--color-primary) 30%, white) 60% 92.5%,
  var(--color-warning) 92.5% 100%
)`;

interface IGrowFunds {
  classes?: string;
}

export function GrowFunds({ classes = "" }: IGrowFunds) {
  return (
    <section className={classes} aria-labelledby="grow-funds-heading">
      <div className="max-w-6xl mx-auto grid gap-14 lg:grid-cols-2 items-center">
        <div className="grid gap-4.5 content-start">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            Grow your funds
          </p>
          <h2 id="grow-funds-heading" className="section-heading">
            This quarter's gifts, next decade's reserves
          </h2>
          <p className="text-muted-fg text-pretty">
            Route any share of your donations into two places money grows:
          </p>
          <div className="grid gap-3.5">
            <div className="flex gap-3.5 items-start bg-card border border-border rounded-lg px-5 py-4.5">
              <span
                className="flex-none size-9.5 rounded-md bg-secondary grid place-items-center font-bold"
                aria-hidden
              >
                %
              </span>
              <div>
                <span className="font-bold">High-yield savings</span>
                <p className="mt-0.5 text-sm/normal text-muted-fg">
                  FDIC-insured, ~3–4% yield, accessible anytime. Electronic
                  payouts within 5 working days.
                </p>
              </div>
            </div>
            <div className="flex gap-3.5 items-start bg-card border border-border rounded-lg px-5 py-4.5">
              <span
                className="flex-none size-9.5 rounded-md bg-secondary grid place-items-center font-bold"
                aria-hidden
              >
                ↗
              </span>
              <div>
                <span className="font-bold">Sustainability Fund</span>
                <p className="mt-0.5 text-sm/normal text-muted-fg">
                  Professionally managed, investment-committee governed,
                  rebalanced quarterly. ~11% average annual return over the past
                  five years.* No setup, AUM, or performance fees.
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-fg">
            *Past performance is not indicative of future results; all
            investments carry risk.
          </p>
        </div>

        <div className="bg-card rounded-lg p-10 shadow-lg shadow-primary/5 grid gap-6 justify-items-center">
          <span className="text-lg font-bold">
            Sustainability Fund target allocation
          </span>
          <div
            className="size-55 rounded-full grid place-items-center"
            style={{ background: donut_bg }}
            role="img"
            aria-label="Target allocation: 50% U.S. equities, 10% non-U.S. equities, 32.5% fixed income, 7.5% metals"
          >
            <div className="size-32.5 rounded-full bg-card grid place-items-center text-center">
              <div>
                <span className="block text-2xl font-bold">~11%</span>
                <span className="text-xs text-muted-fg">
                  avg. annual return,
                  <br />
                  past 5 yrs*
                </span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-7 gap-y-2.5 text-sm">
            {allocation.map((a) => (
              <span key={a.label} className="flex items-center gap-2">
                <span
                  className={`size-3 rounded-sm ${a.swatch} inline-block`}
                  aria-hidden
                />
                {a.pct} {a.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
