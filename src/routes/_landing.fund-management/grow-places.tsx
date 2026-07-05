interface IGrowPlaces {
  classes?: string;
}

export function GrowPlaces({ classes = "" }: IGrowPlaces) {
  return (
    <section className={classes} aria-labelledby="grow-places-heading">
      <div className="max-w-6xl mx-auto">
        <h2
          id="grow-places-heading"
          className="section-heading text-center max-w-2xl mx-auto"
        >
          Two places your money grows
        </h2>
        <div className="grid gap-6 md:grid-cols-2 mt-11">
          <div className="bg-accent border border-border rounded-lg p-9 grid gap-3.5 content-start">
            <span className="justify-self-start text-xs font-bold uppercase tracking-wider bg-secondary text-secondary-fg rounded-full px-3 py-1.5">
              No market risk
            </span>
            <h3 className="text-2xl font-bold">High-yield savings</h3>
            <span className="text-4xl font-bold text-primary">
              ~3-4%{" "}
              <span className="text-base font-normal text-muted-fg">
                annual yield
              </span>
            </span>
            <p className="text-sm/relaxed text-muted-fg">
              FDIC-insured and accessible anytime. A reliable way to build
              reserves while funds stay safe and liquid, with electronic payouts
              within 5 working days whenever you need them.
            </p>
          </div>
          <div className="bg-primary rounded-lg p-9 grid gap-3.5 content-start">
            <span className="justify-self-start text-xs font-bold uppercase tracking-wider bg-primary-fg/15 text-primary-fg rounded-full px-3 py-1.5">
              Long-term growth
            </span>
            <h3 className="text-2xl font-bold text-primary-fg">
              Sustainability Fund
            </h3>
            <span className="text-4xl font-bold text-warning">
              ~11%{" "}
              <span className="text-base font-normal text-primary-fg/80">
                avg. annual return, past 5 yrs*
              </span>
            </span>
            <p className="text-sm/relaxed text-primary-fg/80">
              A professionally managed, pooled investment fund designed for
              long-term stability: your path to an endowment-style reserve,
              whatever your size. DAF gifts can route straight into it.
            </p>
          </div>
        </div>
        <p className="mt-4.5 text-xs text-muted-fg text-center">
          *Past performance is not indicative of future results; all investments
          carry risk.
        </p>
      </div>
    </section>
  );
}
