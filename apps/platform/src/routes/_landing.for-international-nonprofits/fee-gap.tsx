export function FeeGap({ classes = "" }) {
  return (
    <section className={classes}>
      <div className="max-w-6xl mx-auto">
        <p className="eyebrow text-muted-fg mb-3">The math</p>
        <h2 className="section-heading max-w-3xl">
          On a $100,000 year, the fee gap is a staff stipend.
        </h2>
        <p className="section-body text-muted-fg max-w-3xl mt-3 mb-9">
          Typical fiscal sponsors charge 4-10% of everything you raise. We
          charge 2.9%, all-in. Same tax deduction for your donors, thousands
          more for your mission.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 max-w-3xl tabular-nums slashed-zero">
          <div className="bg-card border border-border rounded p-6">
            <p className="eyebrow text-muted-fg">Typical fiscal sponsor</p>
            <p className="text-5xl/tight font-bold mt-3">4-10%</p>
            <p className="text-sm text-muted-fg mt-2">You keep</p>
            <p className="text-xl font-bold">$90,000-$96,000</p>
          </div>
          <div className="bg-card border-2 border-primary rounded p-6">
            <p className="eyebrow text-primary">Better Giving</p>
            <p className="text-5xl/tight font-bold mt-3 text-primary">2.9%</p>
            <p className="text-sm text-muted-fg mt-2">You keep</p>
            <p className="text-xl font-bold text-success">$97,100</p>
          </div>
        </div>

        <p className="mt-6 text-lg font-bold tabular-nums slashed-zero">
          That's $1,100-$7,100 more per year staying with your mission.
        </p>
      </div>
    </section>
  );
}
