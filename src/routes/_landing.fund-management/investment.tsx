import investment_allocation from "#/assets/landing/investment-allocation.png";
import { app_name } from "#/constants/env";

interface IRow {
  pct: string;
  title: string;
  desc: string;
  color: string;
  splits?: { pct: string; label: string; color: string }[];
}

const rows: IRow[] = [
  {
    pct: "60",
    title: "Equity Exposure",
    desc: "Equity exposure is intentionally balanced across styles to reduce dependence on any single market regime.",
    color: "var(--fg)",
    splits: [
      { pct: "50%", label: "US", color: "var(--fg)" },
      { pct: "10%", label: "Non-US", color: "var(--muted-fg)" },
    ],
  },
  {
    pct: "32.5",
    title: "Fixed Income (Bonds)",
    desc: "Provides stability and downside protection through a meaningful allocation to high-quality fixed income.",
    color: "var(--border)",
  },
  {
    pct: "7.5",
    title: "Metals",
    desc: "Provides further portfolio diversification using physical gold and silver shares.",
    color: "var(--warning)",
  },
];

export function Investment({ classes = "" }) {
  return (
    <section className={`${classes}`} aria-labelledby="how-fund-works-heading">
      <div className="max-w-3xl">
        <h2
          id="how-fund-works-heading"
          className="font-bold text-3xl/tight md:text-4.5xl/tight tracking-tight"
        >
          How the Sustainability Fund Works
        </h2>
        <p className="mt-5 text-base leading-relaxed">
          From high-converting donation forms to growth through Savings and a
          Sustainability Fund, plus global fiscal sponsorship. {app_name} is
          built by and for nonprofits. Free—no platform or fund-management fees.
        </p>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,460px)_1fr] gap-x-20 gap-y-10 mt-14 items-center">
        <img
          src={investment_allocation}
          alt="Investment fund allocation: 50% US Equities, 32.5% Bonds, 10% Non-US Equities, 7.5% Metals"
          className="w-full max-w-md justify-self-center"
        />

        <div className="flex flex-col">
          {rows.map((row) => (
            <div
              key={row.title}
              className="grid grid-cols-[auto_1fr] gap-5 py-6 border-b border-border last:border-b-0"
            >
              <div className="text-4xl md:text-5xl font-bold tracking-tight leading-none min-w-32">
                <span
                  className="inline-block size-3 rounded-xs align-middle mr-2.5 mb-1"
                  style={{ background: row.color }}
                />
                {row.pct}
                <span className="text-xl font-bold text-muted-fg ml-0.5">
                  %
                </span>
              </div>
              <div>
                <p className="font-bold mb-1">{row.title}</p>
                <p className="text-sm text-muted-fg leading-relaxed">
                  {row.desc}
                </p>
                {row.splits && (
                  <div className="flex gap-4 mt-2">
                    {row.splits.map((sp) => (
                      <span
                        key={sp.label}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-fg"
                      >
                        <span
                          className="size-2 rounded-xs"
                          style={{ background: sp.color }}
                        />
                        {sp.pct} {sp.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-14 grid md:grid-cols-[auto_1px_1fr] gap-9 items-center border border-border rounded-md p-8 md:px-9">
        <div className="min-w-56">
          <div className="text-5xl md:text-6xl font-bold tracking-tight leading-none inline-flex items-baseline gap-1.5 text-primary">
            11<span className="text-2xl font-bold text-muted-fg">%</span>
            <span className="text-xl text-muted-fg">*</span>
          </div>
          <p className="mt-2 text-sm">
            Average annual return over the past 5 years
          </p>
          <p className="mt-1 text-xs italic text-muted-fg">
            Five-year average; past performance not guaranteed
          </p>
        </div>
        <div className="hidden md:block w-px self-stretch bg-border" />
        <p className="text-sm leading-relaxed text-muted-fg">
          <span className="font-semibold text-fg">
            Past performance is not indicative of future results.
          </span>{" "}
          All investments carry risk, and the value of our portfolio may
          fluctuate. Our investment committee oversees and reviews our portfolio
          to ensure alignment with long-term financial goals, but returns cannot
          be guaranteed.
        </p>
      </div>
    </section>
  );
}
