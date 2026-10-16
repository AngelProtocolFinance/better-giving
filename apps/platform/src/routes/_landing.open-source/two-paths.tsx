import { ExtLink } from "@better-giving/ui";
import { ArrowRight, Check, type LucideIcon, Minus, Plus } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { href, Link } from "react-router";
import { GITHUB_REPO } from "#/constants/urls";

interface IItem {
  Icon: LucideIcon;
  /** the marker's ink — the card's ground decides which set it comes from */
  ink: string;
  children: ReactNode;
}

function Item({ Icon, ink, children }: IItem) {
  return (
    <li className="flex gap-3">
      {/* one line tall, so the marker sits on a wrapped item's first line */}
      <span aria-hidden="true" className={`h-lh flex items-center ${ink}`}>
        <Icon className="icon-md" strokeWidth={3} />
      </span>
      {children}
    </li>
  );
}

interface ITwoPaths {
  classes?: string;
}

export function TwoPaths({ classes = "" }: ITwoPaths) {
  return (
    <section className={classes} aria-labelledby="two-paths-heading">
      <div className="page">
        <div className="grid justify-items-center text-center reveal">
          <h2 id="two-paths-heading" className="section-heading max-w-2xl">
            Two ways to <em className="text-primary">run it</em>
          </h2>
          <p className="mt-5 text-lg/relaxed text-gray-11 max-w-2xl text-pretty">
            Most members choose the managed platform for convenience. The
            self-hosted path exists so that choice is always yours, and always
            will be.
          </p>
        </div>

        <Fork />

        <div className="grid gap-6 md:grid-cols-2 mt-14 md:mt-16 lg:mt-0">
          <div
            className="reveal card-on-band shadow-lift-card flex flex-col gap-5"
            style={{ "--reveal-order": 0 } as CSSProperties}
          >
            <span className="self-start text-2xs font-bold uppercase tracking-label bg-secondary text-gray-12 rounded-full px-3 py-1.5">
              Most popular
            </span>
            <h3 className="subsection-heading">Managed platform</h3>
            <ul className="grid gap-3 text-base/normal text-gray-12">
              <Item Icon={Check} ink="text-primary">
                Live in an afternoon, no engineers needed
              </Item>
              <Item Icon={Check} ink="text-primary">
                We handle receipts, reporting, 990 simplification, PCI scope
              </Item>
              <Item Icon={Check} ink="text-primary">
                Stock, crypto &amp; DAF gifts liquidated for you
              </Item>
              <Item Icon={Check} ink="text-primary">
                Savings &amp; Sustainability Fund built in
              </Item>
              <Item Icon={Check} ink="text-primary">
                Recurring-Donor Portability Guarantee if you ever leave
              </Item>
            </ul>
            <Link
              to={href("/register")}
              className="btn btn-lg btn-primary self-start mt-auto max-sm:self-stretch"
            >
              Join free forever
            </Link>
          </div>

          <div
            className="reveal relative isolate overflow-clip rounded surface-deep shadow-lift-card p-6 flex flex-col gap-5"
            style={{ "--reveal-order": 1 } as CSSProperties}
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 -z-10 dot-grid dot-grid-fade"
            />
            <span className="self-start font-mono text-2xs font-bold uppercase tracking-label text-amber-6 border rounded-full px-3 py-1.5">
              Maximum control
            </span>
            <h3 className="subsection-heading">Self-hosted</h3>
            {/* a diff's markers: what you gain, and the one thing you take on */}
            <ul className="grid gap-3 font-mono text-sm/normal">
              <Item Icon={Plus} ink="text-amber-6">
                Run the form on your own infrastructure
              </Item>
              <Item Icon={Plus} ink="text-amber-6">
                Your own gateway &amp; merchant account, zero intermediary
              </Item>
              <Item Icon={Plus} ink="text-amber-6">
                Recurring-donor tokens yours from day one
              </Item>
              <Item Icon={Plus} ink="text-amber-6">
                Free software: you pay only your gateway's processing costs
              </Item>
              <Item Icon={Minus} ink="text-blue-5">
                <span className="text-blue-5">
                  You handle receipts, compliance &amp; ops yourself
                </span>
              </Item>
            </ul>
            <ExtLink
              href={GITHUB_REPO}
              className="group btn btn-lg btn-secondary gap-2 self-start mt-auto max-sm:self-stretch"
            >
              Get the code
              <ArrowRight
                aria-hidden="true"
                className="icon-md transition-transform group-hover:translate-x-0.5"
              />
            </ExtLink>
          </div>
        </div>
      </div>
    </section>
  );
}

/** the choice drawn as a fork in the road: one trunk under the heading,
 *  splitting toward the centre of each card. lg only — stacked or narrow
 *  columns have no room for the split to read. the svg stretches to the grid's
 *  width, so its strokes are non-scaling and its nodes are html. */
function Fork() {
  const trunk = "M500 0V36";
  const left = "M500 36C500 76 250 52 250 96";
  const right = "M500 36C500 76 750 52 750 96";
  const stroke =
    "fill-none [stroke-width:2] [stroke-linecap:round] [vector-effect:non-scaling-stroke]";
  return (
    <div aria-hidden="true" className="relative max-lg:hidden mt-10 h-24">
      <svg
        aria-hidden="true"
        viewBox="0 0 1000 96"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full overflow-visible"
      >
        <path d={trunk} className={`${stroke} stroke-gray-7`} />
        <path d={left} className={`${stroke} stroke-primary`} />
        <path d={right} className={`${stroke} stroke-primary-deep`} />
      </svg>
      <span className="absolute left-1/2 top-9 size-3 -translate-1/2 rounded-full border-2 border-gray-7 bg-band" />
      <span className="absolute left-1/4 bottom-0 size-3 -translate-x-1/2 translate-y-1/2 rounded-full bg-primary" />
      <span className="absolute left-3/4 bottom-0 size-3 -translate-x-1/2 translate-y-1/2 rounded-full bg-primary-deep" />
    </div>
  );
}
