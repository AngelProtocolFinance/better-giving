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
        <div className="grid reveal">
          <h2 id="two-paths-heading" className="section-heading max-w-2xl">
            Two ways to run it
          </h2>
          <p className="mt-5 text-lg/relaxed text-gray-11 max-w-2xl text-pretty">
            Most members choose the managed platform for convenience. The
            self-hosted path exists so that choice is always yours, and always
            will be.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 mt-14 md:mt-16">
          <div
            className="reveal tile flex flex-col gap-5"
            style={{ "--reveal-order": 0 } as CSSProperties}
          >
            <p className="text-sm text-gray-11">Most popular</p>
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
            className="reveal rounded surface-deep p-6 md:p-8 flex flex-col gap-5"
            style={{ "--reveal-order": 1 } as CSSProperties}
          >
            <p className="text-sm text-blue-5">Maximum control</p>
            <h3 className="subsection-heading">Self-hosted</h3>
            {/* a diff's markers: what you gain, and the one thing you take on */}
            <ul className="grid gap-3 text-base/normal">
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
