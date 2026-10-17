import { Info } from "lucide-react";
import type { CSSProperties } from "react";

interface IWhoPays {
  classes?: string;
}

export function WhoPays({ classes = "" }: IWhoPays) {
  return (
    <section className={classes} aria-labelledby="who-pays-heading">
      <div className="page grid gap-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20 items-center">
        <div className="grid gap-8 justify-items-start">
          <div className="reveal grid gap-5">
            <h2 id="who-pays-heading" className="section-heading max-w-xl">
              So who pays for all this?
            </h2>
            <p className="text-lg/relaxed text-gray-11 text-pretty max-w-xl">
              Donors do, voluntarily. At checkout, donors can add an optional
              contribution to Better Giving. It's always{" "}
              <strong className="text-gray-12">
                opt-in and never pre-selected
              </strong>
              . That keeps the commons free for every nonprofit. And third-party
              processing fees? Most donors choose to cover them, so the vast
              majority of every gift reaches you.
            </p>
          </div>
          <div
            className="reveal tile flex gap-4 max-w-xl"
            style={{ "--reveal-order": 1 } as CSSProperties}
          >
            <Info aria-hidden className="icon-lg mt-0.5 text-primary" />
            <p className="text-sm/relaxed text-gray-11 text-pretty">
              <strong className="text-gray-12">
                Prefer no contribution ask on your form?
              </strong>{" "}
              You can opt out of the donor-contribution model in favor of a
              simple 1.5% platform fee, your choice, always.
            </p>
          </div>
        </div>

        <Receipt />
      </div>
    </section>
  );
}

const zero_lines = [
  { label: "Platform fee", note: "(while the donor ask stays on)" },
  { label: "Setup fee" },
  { label: "Exit fee" },
] as const;

const pass_through = [
  { label: "Donor contribution", note: "(optional, opt-in)" },
  { label: "Card processing", note: "(most donors cover)" },
] as const;

/** decorative: its aria-label is the whole of what it says */
function Receipt() {
  return (
    <div
      role="img"
      aria-label="Illustrative receipt: on a $100 donation, the platform fee (while the optional donor contribution stays on), setup fee and exit fee are all $0.00. The donor contribution is optional, and most donors cover card processing."
      className="reveal w-full max-w-sm justify-self-center lg:justify-self-end"
    >
      <div
        aria-hidden
        className="bg-surface border border-b-0 rounded-t px-6 pt-7 pb-6 font-mono text-xs sm:text-sm text-gray-12"
      >
        <div className="grid justify-items-center gap-1 text-center">
          <span className="font-body text-base font-bold">Better Giving</span>
          <span className="eyebrow text-gray-11">Donation receipt</span>
          <span className="text-gray-11">No. 0001</span>
        </div>

        <div className="grid gap-2.5 mt-6 pt-6 border-t border-dashed">
          <Line label="Donation" value="$100.00" />
          {zero_lines.map((line, i) => (
            <Line
              key={line.label}
              label={line.label}
              note={"note" in line ? line.note : undefined}
              value="$0.00"
              classes="reveal"
              order={i}
            />
          ))}
        </div>

        <div className="grid gap-2.5 mt-5 pt-5 border-t border-dashed text-gray-11">
          {pass_through.map(({ label, note }) => (
            <Line key={label} label={label} note={note} value="—" />
          ))}
        </div>

        <div className="h-1 mt-5 border-y" />
        <div className="grid gap-1 mt-5">
          <span className="eyebrow text-gray-11">Better Giving fees</span>
          <span className="display-figure text-6xl text-primary">$0.00</span>
        </div>
      </div>
      <TornEdge />
    </div>
  );
}

interface ILine {
  label: string;
  /** a second line under the label, so a long label never wraps mid-word */
  note?: string;
  value: string;
  classes?: string;
  order?: number;
}

function Line({ label, note, value, classes = "", order }: ILine) {
  return (
    <div
      className={`${classes} flex flex-wrap items-baseline gap-x-2 gap-y-0.5`}
      style={
        order === undefined
          ? undefined
          : ({ "--reveal-order": order } as CSSProperties)
      }
    >
      <span>{label}</span>
      <span className="flex-1 min-w-4 border-b border-dotted border-gray-7" />
      <span className="flex-none">{value}</span>
      {note ? <span className="basis-full text-xs">{note}</span> : null}
    </div>
  );
}

const TEETH = 18;
const TOOTH_W = 12;
const TOOTH_H = 8;
const zigzag = Array.from(
  { length: TEETH },
  (_, i) => `L${i * TOOTH_W + TOOTH_W / 2} ${TOOTH_H}L${(i + 1) * TOOTH_W} 0`
).join("");

/** the paper's torn foot: surface-filled teeth with the card's hairline along
 *  their edge, stretched to whatever width the receipt takes */
function TornEdge() {
  const w = TEETH * TOOTH_W;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${w} ${TOOTH_H}`}
      preserveAspectRatio="none"
      className="block w-full h-3 -mt-px overflow-visible"
    >
      <path d={`M0 0${zigzag}Z`} className="fill-surface" />
      <path
        d={`M0 0${zigzag}`}
        vectorEffect="non-scaling-stroke"
        className="fill-none stroke-gray-7"
      />
    </svg>
  );
}
