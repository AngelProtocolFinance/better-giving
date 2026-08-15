const claims = [
  "No credit card. No contract.",
  "Candid Platinum Transparency",
  "NCN ethical fundraising principles, endorsed",
  "U.S. 501(c)(3), EIN public",
] as const;

interface ITrustStrip {
  classes?: string;
}

export function TrustStrip({ classes = "" }: ITrustStrip) {
  return (
    <div className={classes}>
      <ul className="max-w-6xl mx-auto flex flex-wrap justify-center gap-x-10 gap-y-2 text-sm font-medium">
        {claims.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
}
