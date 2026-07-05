import { Check as CheckIcon } from "lucide-react";
import { href, Link } from "react-router";

interface ICheck {
  children: React.ReactNode;
  /** on-navy featured card uses success accent for contrast */
  dark?: boolean;
}

function Check({ children, dark }: ICheck) {
  return (
    <span className="flex gap-2.5 text-sm/normal">
      <CheckIcon
        className={`flex-none size-4 mt-0.5 ${dark ? "text-success" : "text-primary"}`}
        strokeWidth={3}
        aria-hidden
      />
      {children}
    </span>
  );
}

interface IPriceCards {
  classes?: string;
}

export function PriceCards({ classes = "" }: IPriceCards) {
  return (
    <div className={`${classes}`}>
      <div className="max-w-6xl mx-auto grid gap-6 md:grid-cols-3">
        <div className="bg-primary rounded-lg p-8 flex flex-col gap-3.5 shadow-xl shadow-primary/20 text-primary-fg">
          <span className="text-lg font-bold">
            Fundraising &amp; fund management
          </span>
          <span className="text-5xl font-bold">
            $0
            <span className="text-base font-normal text-primary-fg/80">
              {" "}
              (all features included)
            </span>
          </span>
          <div className="grid gap-2 text-primary-fg/90">
            <Check dark>Donation form, every gift type, embedding</Check>
            <Check dark>
              Recurring giving, peer-to-peer, receipts &amp; reporting
            </Check>
            <Check dark>
              High-yield savings &amp; Sustainability Fund, with no setup, AUM,
              or performance fees
            </Check>
            <Check dark>Full donor data, exports, portability guarantee</Check>
          </div>
          <Link
            to={href("/register/welcome")}
            className="btn btn-secondary mt-auto"
          >
            Join free forever
          </Link>
        </div>

        <div className="bg-card border border-border rounded-lg p-8 flex flex-col gap-3.5">
          <span className="text-lg font-bold">Fiscal sponsorship</span>
          <span className="text-5xl font-bold">
            2.9%
            <span className="text-base font-normal text-muted-fg">
              {" "}
              per sponsored gift
            </span>
          </span>
          <div className="grid gap-2">
            <Check>
              Tax-deductible U.S. giving for orgs abroad or without a 501(c)(3)
            </Check>
            <Check>Compliance, receipts &amp; granting handled</Check>
            <Check>
              Market rate is 4-10%, and we're working to make ours
              donor-coverable
            </Check>
          </div>
          <Link
            to={href("/fiscal-sponsorship")}
            className="btn btn-secondary mt-auto"
          >
            Learn more
          </Link>
        </div>

        <div className="bg-card border border-border rounded-lg p-8 flex flex-col gap-3.5">
          <span className="text-lg font-bold">Self-hosted</span>
          <span className="text-5xl font-bold">
            $0
            <span className="text-base font-normal text-muted-fg">
              {" "}
              (open-source software)
            </span>
          </span>
          <div className="grid gap-2">
            <Check>Run the donation form on your own infrastructure</Check>
            <Check>Your own gateway: you pay only its processing costs</Check>
            <Check>Total ownership of tokens, data &amp; donors</Check>
          </div>
          <Link to={href("/open-source")} className="btn btn-secondary mt-auto">
            See the open source
          </Link>
        </div>
      </div>
    </div>
  );
}
