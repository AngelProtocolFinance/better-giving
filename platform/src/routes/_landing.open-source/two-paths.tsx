import { ArrowRight, Check, Minus } from "lucide-react";
import { href, Link } from "react-router";
import { ExtLink } from "#/components/ext-link";
import { GITHUB_REPO } from "#/constants/urls";

interface IItem {
  children: React.ReactNode;
  /** minus marker for the tradeoff line */
  con?: boolean;
}

function Item({ children, con }: IItem) {
  const Icon = con ? Minus : Check;
  return (
    <span className="flex gap-2.5 text-sm/normal">
      <Icon
        className={`flex-none size-4 mt-0.5 ${con ? "text-muted-fg" : "text-primary"}`}
        strokeWidth={3}
        aria-hidden
      />
      {children}
    </span>
  );
}

interface ITwoPaths {
  classes?: string;
}

export function TwoPaths({ classes = "" }: ITwoPaths) {
  return (
    <div className={classes}>
      <div className="max-w-6xl mx-auto">
        <h2 className="section-heading text-center max-w-2xl mx-auto">
          Two ways to run it
        </h2>
        <p className="mt-3.5 text-muted-fg text-center max-w-2xl mx-auto text-pretty">
          Most members choose the managed platform for convenience. The
          self-hosted path exists so that choice is always yours, and always
          will be.
        </p>
        <div className="grid gap-6 md:grid-cols-2 mt-11">
          <div className="bg-card rounded-lg p-9 shadow-lg shadow-primary/5 flex flex-col gap-3.5">
            <span className="justify-self-start self-start text-2xs font-bold uppercase tracking-wider bg-secondary text-secondary-fg rounded-full px-3 py-1.5">
              Most popular
            </span>
            <h3 className="text-2xl font-bold">Managed platform</h3>
            <div className="grid gap-2">
              <Item>Live in an afternoon, no engineers needed</Item>
              <Item>
                We handle receipts, reporting, 990 simplification, PCI scope
              </Item>
              <Item>Stock, crypto &amp; DAF gifts liquidated for you</Item>
              <Item>Savings &amp; Sustainability Fund built in</Item>
              <Item>
                Recurring-Donor Portability Guarantee if you ever leave
              </Item>
            </div>
            <Link
              to={href("/register/welcome")}
              className="btn btn-primary self-start mt-auto"
            >
              Join free forever
            </Link>
          </div>

          <div className="bg-card rounded-lg p-9 shadow-lg shadow-primary/5 flex flex-col gap-3.5">
            <span className="self-start text-2xs font-bold uppercase tracking-wider bg-secondary text-secondary-fg rounded-full px-3 py-1.5">
              Maximum control
            </span>
            <h3 className="text-2xl font-bold">Self-hosted</h3>
            <div className="grid gap-2">
              <Item>Run the form on your own infrastructure</Item>
              <Item>
                Your own gateway &amp; merchant account, zero intermediary
              </Item>
              <Item>Recurring-donor tokens yours from day one</Item>
              <Item>
                Free software: you pay only your gateway's processing costs
              </Item>
              <Item con>
                You handle receipts, compliance &amp; ops yourself
              </Item>
            </div>
            <ExtLink
              href={GITHUB_REPO}
              className="btn btn-secondary gap-2 self-start mt-auto"
            >
              Get the code
              <ArrowRight className="size-4" />
            </ExtLink>
          </div>
        </div>
      </div>
    </div>
  );
}
