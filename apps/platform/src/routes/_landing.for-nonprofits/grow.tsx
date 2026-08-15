import { href, Link } from "react-router";

const accounts = [
  {
    name: "Current account",
    detail: "Grants paid out to your bank",
    figure: "Instant access",
    figure_classes: "",
  },
  {
    name: "Savings account",
    detail: "High-yield reserves",
    figure: "3% to 4% APY",
    figure_classes: "text-success",
  },
  {
    name: "Sustainability Fund",
    detail: "Long-term diversified investment",
    figure: "~11% historical*",
    figure_classes: "text-success",
  },
] as const;

interface IGrow {
  classes?: string;
}

export function Grow({ classes = "" }: IGrow) {
  return (
    <section className={classes} aria-labelledby="grow-heading">
      <div className="max-w-6xl mx-auto grid gap-9 lg:gap-14 lg:grid-cols-2 items-center">
        <div>
          <h2 id="grow-heading" className="section-heading">
            Don't just raise it. Grow it.
          </h2>
          <p className="mt-4 text-muted-fg text-pretty">
            Every donation can be split automatically between funds you control:
            spend now, build reserves, or invest for the long term. It's how
            small nonprofits build the three to six months of operating reserves
            the strong ones have.
          </p>
          <p className="mt-4 text-muted-fg">
            You set the split once. We handle the rest.
          </p>
          <Link
            to={href("/fund-management")}
            className="inline-block mt-6 font-semibold text-primary hover:underline"
          >
            See how fund management works
          </Link>
        </div>

        <div>
          <div className="bg-card border border-border rounded-lg divide-y divide-border overflow-hidden">
            {accounts.map((a) => (
              <div
                key={a.name}
                className="flex justify-between items-center gap-4 p-4"
              >
                <div>
                  <div className="text-sm font-bold">{a.name}</div>
                  <div className="text-xs text-muted-fg">{a.detail}</div>
                </div>
                <div
                  className={`text-sm font-bold whitespace-nowrap tabular-nums ${a.figure_classes}`}
                >
                  {a.figure}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-fg">
            *Historical returns are not a guarantee of future performance.
            Allocations are always your choice.
          </p>
        </div>
      </div>
    </section>
  );
}
