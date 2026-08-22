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
   * `bar` — the thin ruled strip that sits directly under a hero.
   * `band` — a section in its own right: centered, larger figures, and no
   * rules between the figures at mobile.
   * neither owns its gutter, padding or border — those are the caller's, so a
   * band can butt up against a neighbour without doubling the rule and can
   * match its page's gutter.
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
      <div className="page grid grid-cols-2 md:grid-cols-4 gap-y-6 tabular-nums slashed-zero">
        {items.map((s, i) => (
          <div
            key={s.value}
            className={`grid gap-0.5 content-start ${band ? "text-center" : ""} ${i > 0 ? `md:border-l md:border-border ${band ? "" : "md:pl-9"}` : ""} ${
              // a centered 2-up pair reads as a block; a rule between the two
              // halves only fights the centering
              !band && i % 2 === 1
                ? "max-md:border-l max-md:border-border max-md:pl-6"
                : ""
            }`}
          >
            <span
              className={`font-bold ${band ? "text-3xl md:text-4xl" : "text-2xl md:text-3xl"} ${s.accent ? "text-primary" : ""}`}
            >
              {s.value}
            </span>
            <span className="text-sm text-muted-fg">{s.label}</span>
          </div>
        ))}
      </div>
    </El>
  );
}
