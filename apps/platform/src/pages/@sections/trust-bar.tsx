interface Stat {
  value: string;
  label: string;
  /** lifts one figure out of the row — the number the page is arguing for */
  accent?: boolean;
}

const home_stats: readonly Stat[] = [
  { value: "210+", label: "nonprofits worldwide" },
  { value: "$6M+", label: "raised for partners" },
  { value: "$0", label: "platform or fund fees" },
  { value: "2021", label: "serving nonprofits since" },
];

interface ITrustBar {
  classes?: string;
  items?: readonly Stat[];
  /**
   * `bar` — the strip that sits directly under a hero.
   * `band` — a section in its own right, with larger figures.
   * both are left-aligned columns parted by space alone, no rules (ledger →
   * "Marketing house rules"). neither owns its gutter, padding or ground —
   * those are the caller's, so a band can sit on its page's alternating
   * fill and match its page's gutter.
   */
  variant?: "bar" | "band";
  /** names the region as a landmark; without it the row stays a plain div */
  label?: string;
}

export function TrustBar({
  classes = "",
  items = home_stats,
  variant = "bar",
  label,
}: ITrustBar) {
  const band = variant === "band";
  const El = label ? "section" : "div";

  return (
    <El aria-label={label} className={classes}>
      <div
        className={`page grid grid-cols-2 md:grid-cols-4 gap-x-6 md:gap-x-10 figures slashed-zero ${band ? "gap-y-8" : "gap-y-6"}`}
      >
        {items.map((s) => (
          <div key={s.value} className="grid gap-2 content-start">
            <span
              className={`display-figure ${band ? "text-4xl md:text-5xl" : "text-3xl md:text-4xl"} ${s.accent ? "text-primary" : ""}`}
            >
              {s.value}
            </span>
            <span className="text-sm text-gray-11">{s.label}</span>
          </div>
        ))}
      </div>
    </El>
  );
}
