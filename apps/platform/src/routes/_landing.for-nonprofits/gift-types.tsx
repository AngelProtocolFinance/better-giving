const gift_types = [
  "Cards",
  "Bank (ACH)",
  "Stocks",
  "DAFs",
  "Crypto",
  "Recurring",
] as const;

interface IGiftTypes {
  classes?: string;
}

export function GiftTypes({ classes = "" }: IGiftTypes) {
  return (
    <section className={classes} aria-labelledby="gift-types-heading">
      <div className="max-w-6xl mx-auto">
        <h2 id="gift-types-heading" className="section-heading">
          Every gift type. One free platform.
        </h2>
        <p className="mt-3 max-w-3xl text-lg text-muted-fg text-pretty">
          Most platforms charge 2% to 5%, or gate gift types behind paid tiers.
          Better Giving gives you the full toolkit at no cost, because donors
          cover processing or chip in voluntarily, always opt-in.
        </p>

        <div className="grid gap-5 mt-10 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr]">
          <div className="md:col-span-2 lg:col-span-1 lg:row-span-2 bg-card border border-border rounded-lg p-8 flex flex-col justify-center">
            <h3 className="text-2xl">Accept every gift type</h3>
            <p className="mt-3 max-w-md leading-relaxed text-muted-fg text-pretty">
              One embeddable donation form for everything your donors want to
              give.
            </p>
            <div className="flex flex-wrap gap-2 mt-6">
              {gift_types.map((g) => (
                <span
                  key={g}
                  className="text-sm font-semibold bg-secondary text-secondary-fg rounded-sm px-3 py-1.5"
                >
                  {g}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6 flex flex-col justify-center">
            <h3 className="text-lg">Own your donors</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-fg text-pretty">
              Your donor data belongs to you, full stop. No unauthorized
              listings, no marketing to your donors, no lock-in. Nonprofit
              consent is principle #1, and we live it.
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6 flex flex-col justify-center">
            <h3 className="text-lg">Set up in an afternoon</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-fg text-pretty">
              Embed your form and connect your bank in an afternoon. Most
              accounts are approved within 3 business days, and tax receipts,
              donor records, and compliance are handled automatically.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
