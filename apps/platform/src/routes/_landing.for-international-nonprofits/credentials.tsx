const items = [
  "Candid Platinum Transparency",
  "NCN ethical fundraising principles, endorsed",
  "U.S. 501(c)(3) sponsor · EIN public",
] as const;

export function Credentials({ classes = "" }) {
  return (
    <div className={classes}>
      <ul className="page flex flex-wrap justify-center gap-x-10 gap-y-2 text-sm font-medium">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}
