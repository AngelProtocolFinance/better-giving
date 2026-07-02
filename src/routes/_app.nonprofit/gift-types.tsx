const gift_types = [
  { title: "Card", body: "Credit & debit, with express checkout" },
  { title: "Bank / ACH", body: "Lowest-fee direct transfers" },
  { title: "PayPal & Venmo", body: "One-tap for millions of donors" },
  { title: "Apple / Google Pay", body: "Express mobile checkout" },
  { title: "Stock", body: "Larger gifts, tax benefits for donors" },
  { title: "Donor-Advised Funds", body: "DAFpay via Chariot, built in" },
  { title: "IRA / QCD", body: "Qualified charitable distributions" },
  { title: "Crypto", body: "Accepted & liquidated to cash" },
] as const;

interface IGiftTypes {
  classes?: string;
}

export function GiftTypes({ classes = "" }: IGiftTypes) {
  return (
    <section className={classes} aria-labelledby="gift-types-heading">
      <div className="max-w-6xl mx-auto">
        <p className="text-xs font-bold uppercase tracking-wider text-primary text-center">
          Payment aggregation
        </p>
        <h2
          id="gift-types-heading"
          className="section-heading text-center mt-3 max-w-2xl mx-auto"
        >
          Every way to give, in one flow
        </h2>
        <p className="mt-3.5 text-muted-fg text-center max-w-2xl mx-auto text-pretty">
          Stop turning donors away. One integration covers everything — no extra
          portals, no added admin. Non-cash gifts are liquidated for you and
          granted as cash.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-11">
          {gift_types.map((g) => (
            <div
              key={g.title}
              className="bg-accent border border-border rounded-lg px-6 py-5.5"
            >
              <span className="block font-bold">{g.title}</span>
              <span className="text-sm/normal text-muted-fg">{g.body}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
