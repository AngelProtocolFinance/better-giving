import {
  HandCoins,
  Landmark,
  PiggyBank,
  Repeat,
  TrendingUp,
} from "lucide-react";

/** the page's own example split ("Set your split once", step 1) */
const split = [
  {
    pct: 80,
    label: "Grant to bank",
    spoken: "granted to your bank",
    Icon: Landmark,
    bar: "bg-primary",
    flow: "fill-primary/25",
  },
  {
    pct: 15,
    label: "Savings",
    spoken: "to high-yield savings",
    Icon: PiggyBank,
    bar: "bg-blue-6",
    flow: "fill-blue-6/50",
  },
  {
    pct: 5,
    label: "Sustainability Fund",
    spoken: "to the Sustainability Fund",
    Icon: TrendingUp,
    bar: "bg-amber-9",
    flow: "fill-amber-9/50",
  },
] as const;

const GIFT = 100;

// flows on a 300x100 box stretched to the diagram's width: each leaves its own
// share of the bar (3 units per percent) and lands on the centre of its column
// (100 units each, matching the grid-cols-3 below, which therefore takes no
// column gap), narrowed to 1 unit per percent — the node bar's width there.
const flows = split.map((s, i) => {
  const x0 = split.slice(0, i).reduce((sum, x) => sum + x.pct * 3, 0);
  const x1 = x0 + s.pct * 3;
  const d0 = 100 * i + 50 - s.pct / 2;
  const d1 = d0 + s.pct;
  return {
    ...s,
    d: `M${x0} 0C${x0} 50 ${d0} 50 ${d0} 100L${d1} 100C${d1} 50 ${x1} 50 ${x1} 0Z`,
  };
});

const description = `Example split of a $${GIFT} gift: ${split.map((s) => `${s.pct}% ${s.spoken}`).join(", ")}. Every gift follows your split.`;

interface ISplitDiagram {
  classes?: string;
}

/** a gift arriving and dividing three ways, as a small sankey built from
 *  tokens. one image to assistive tech; the drawing is aria-hidden. */
export function SplitDiagram({ classes = "" }: ISplitDiagram) {
  return (
    <div
      role="img"
      aria-label={description}
      className={`${classes} card shadow-lift-card grid`}
    >
      <div aria-hidden="true" className="contents">
        <div className="flex items-center gap-4">
          <span className="flex-center size-12 rounded-full bg-secondary text-primary">
            <HandCoins className="icon-2xl" />
          </span>
          <span className="grid gap-1">
            <span className="text-sm text-gray-11">Incoming gift</span>
            <span className="display-figure text-4xl">${GIFT}</span>
          </span>
        </div>

        <div className="relative mt-8 flex h-3 rounded-full overflow-hidden">
          {split.map((s) => (
            <span
              key={s.label}
              className={`h-full ${s.bar}`}
              style={{ width: `${s.pct}%` }}
            />
          ))}
        </div>
        <svg
          aria-hidden="true"
          viewBox="0 0 300 100"
          preserveAspectRatio="none"
          className="block w-full h-20 md:h-24 -mt-1.5"
        >
          {flows.map((f) => (
            <path key={f.label} d={f.d} className={f.flow} />
          ))}
        </svg>

        <ul className="grid grid-cols-3">
          {split.map(({ pct, label, Icon, bar }) => (
            <li
              key={label}
              className="grid content-start justify-items-center text-center px-1"
            >
              <span
                className={`h-1.5 rounded-full ${bar}`}
                style={{ width: `${pct}%` }}
              />
              <span className="mt-4 flex-center size-10 rounded-full bg-secondary text-primary">
                <Icon className="icon-xl" />
              </span>
              <span className="mt-3 display-figure text-3xl md:text-4xl">
                {pct}%
              </span>
              <span className="mt-2 text-sm/snug font-bold text-balance">
                {label}
              </span>
              <span className="mt-1 text-xs text-gray-11">
                ${(GIFT * pct) / 100}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-6 border-t pt-4 flex items-center gap-2 text-sm text-gray-11">
          <Repeat className="icon-md text-primary" />
          Every gift follows your split. Change it anytime.
        </p>
      </div>
    </div>
  );
}
