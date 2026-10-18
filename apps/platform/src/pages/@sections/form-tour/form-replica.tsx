import {
  Building2,
  ChartSpline,
  ChevronDown,
  Coins,
  CreditCard,
  Landmark,
  LightbulbIcon,
  ListCheck,
  PencilIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import dafpay from "#/assets/icons/dafpay.svg";
import express_buttons from "#/assets/images/express-buttons.webp";
import { Laira } from "./laira";
import type { IFrame, TMethod } from "./progress";

/* a presentational copy of the donation form (`components/donation`): the same
   labels, tab names, icons and layout, drawn from tokens. the real `Steps`
   loads the stripe and paypal sdks and fetches /api/currencies, which an
   illustration on the home page must not. every string here mirrors one in
   that tree; when the form's copy changes, this changes with it. */

const TABS: Record<TMethod, { name: string; icon: ReactNode }> = {
  stripe: { name: "Card", icon: <CreditCard className="icon-lg shrink-0" /> },
  stripe_bank: {
    name: "Bank Transfer",
    icon: <Landmark className="icon-lg shrink-0" />,
  },
  daf: {
    name: "Donor Advised Fund",
    icon: <img src={dafpay} alt="" className="shrink-0 h-4" />,
  },
  stocks: {
    name: "Stocks",
    icon: <ChartSpline className="icon-lg shrink-0" />,
  },
  ira_qcd: {
    name: "IRA / QCD",
    icon: <Building2 className="icon-lg shrink-0" />,
  },
  crypto: { name: "Crypto", icon: <Coins className="shrink-0 icon-xl" /> },
};

interface ILayers {
  /** every layer rendered in one grid cell, crossfading, so the box is as tall
   *  as its tallest state and never jumps; otherwise only the shown layer */
  live: boolean;
  show: string;
  layers: Record<string, ReactNode>;
  classes?: string;
}

function Layers({ live, show, layers, classes = "" }: ILayers) {
  if (!live) return <div className={`grid ${classes}`}>{layers[show]}</div>;
  return (
    <div className={`grid ${classes}`}>
      {Object.entries(layers).map(([key, node]) => (
        <div
          key={key}
          className={`grid col-start-1 row-start-1 transition-opacity duration-base ${
            key === show ? "opacity-100" : "opacity-0"
          }`}
        >
          {node}
        </div>
      ))}
    </div>
  );
}

function Frequency({ value }: { value: IFrame["frequency"] }) {
  const opt = (on: boolean) =>
    `text-sm rounded px-4 py-2 border flex items-center justify-center @md/frequency:justify-start transition-colors ${
      on ? "bg-form-primary text-primary-fg border-transparent" : ""
    }`;
  return (
    <div className="@container/frequency">
      <p className="mb-1 label">
        Frequency <span className="text-destructive-subtle-fg">*</span>
      </p>
      <div className="grid grid-cols-2 gap-2 @md/frequency:flex">
        <span className={opt(value === "one-time")}>Give Once</span>
        <span className={opt(value === "monthly")}>Give Monthly</span>
      </div>
      <p className="text-gray-11 text-sm my-2">
        <span className="font-medium text-sm">Recurring donations</span> help
        nonprofits focus on mission and long-term impact, not fundraising.
        Cancel anytime.
      </p>
    </div>
  );
}

interface ITokenAmount {
  label: string;
  unit: string;
  amount: string;
}

function TokenAmount({ label, unit, amount }: ITokenAmount) {
  return (
    <div className="grid">
      <p data-required="true" className="me-auto label">
        {label}
      </p>
      <div className="mt-1 grid grid-cols-[auto_1fr] field-input-container pe-5 divide-x divide-gray-6">
        <span className="flex items-center gap-2 px-4 py-3.5">
          {unit}
          <ChevronDown className="icon-md text-gray-11" />
        </span>
        <span className="ps-2 py-3.5 font-semibold">{amount}</span>
      </div>
    </div>
  );
}

interface IPlainField {
  label: string;
  required?: boolean;
  value?: string;
  placeholder: string;
}

function PlainField({ label, required, value, placeholder }: IPlainField) {
  return (
    <div className="grid">
      <p data-required={required ? "true" : undefined} className="label mb-1">
        {label}
      </p>
      <span className={`field-input ${value ? "" : "text-gray-11"}`}>
        {value || placeholder}
      </span>
    </div>
  );
}

function Increments() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {["40", "100", "200", "400"].map((v) => (
        <span
          key={v}
          className="rounded p-2 bg-form-secondary text-start text-sm font-medium text-form-primary transition-colors"
        >
          +{v} USD
        </span>
      ))}
    </div>
  );
}

interface ISwitch {
  on: boolean;
  label: string;
  /** the contribution's label greys while off; the fee toggle's never does */
  dim?: boolean;
  classes?: string;
}

function Switch({ on, label, dim, classes = "" }: ISwitch) {
  return (
    <span className={`${classes} gap-x-1 flex items-start text-sm`}>
      <span
        className={`flex shrink-0 items-center h-lh w-8 rounded-full p-1 transition-colors ${
          on ? "bg-form-primary" : "bg-gray-3"
        }`}
      >
        <span
          className={`inline-block h-[0.8lh] aspect-square rounded-full bg-surface transition-transform ${
            on ? "translate-x-3.5" : "-translate-x-0.5"
          }`}
        />
      </span>
      <span className={`font-medium ${dim && !on ? "text-gray-11" : ""}`}>
        {label}
      </span>
    </span>
  );
}

function BgTxtLogo() {
  return (
    <>
      <span className="font-bold text-primary">Better.</span>
      <span className="font-bold text-primary">Giving</span>{" "}
      <span className="text-primary text-2xs">501(c)(3)</span>
    </>
  );
}

function TipField({ on, live }: { on: boolean; live: boolean }) {
  const chip = (checked: boolean) =>
    `text-xs outline outline-form-secondary px-2 py-1 rounded transition-colors ${
      checked ? "bg-form-secondary text-form-primary" : ""
    }`;
  return (
    <div className="mt-2 flex items-center py-1 border-y justify-between flex-wrap gap-x-3 gap-y-1">
      <Switch on={on} dim label="Support free fundraising tools" />
      <span className="flex gap-x-1">
        <span className={chip(on)}>10%</span>
        <span className={chip(false)}>15%</span>
        <span className={chip(false)}>20%</span>
        <span className={`${chip(false)} flex-center`}>
          <PencilIcon className="inline-block icon-xs" />
        </span>
      </span>
      <Layers
        live={live}
        show={on ? "on" : "off"}
        classes="w-full"
        layers={{
          off: (
            <p className="text-gray-11 text-sm">
              <BgTxtLogo /> is a nonprofit and charges no platform fees. A small
              optional contribution — separate from any payment processing fee —
              helps keep this free for every nonprofit.
            </p>
          ),
          on: (
            <p className="text-sm">
              Your contribution to <BgTxtLogo /> is separate from payment
              processing fees and goes directly to keeping this platform free
              for nonprofits. Thank you.
            </p>
          ),
        }}
      />
    </div>
  );
}

interface IRow {
  label: ReactNode;
  value: string;
  classes?: string;
}

function Row({ label, value, classes = "" }: IRow) {
  return (
    <div className={`${classes} grid grid-cols-[1fr_auto] gap-x-3 py-2`}>
      <dt>{label}</dt>
      <dd className="figures">{value}</dd>
    </div>
  );
}

/** the pricing receipt's fee line, beside the charge it rides on */
function FeeSummary({ on }: { on: boolean }) {
  return (
    <dl className="mt-2 grid text-sm border-y divide-y divide-gray-6">
      <Row
        label={
          <>
            Platform fee{" "}
            <span className="text-gray-11">(while the donor ask stays on)</span>
          </>
        }
        value="$0.00"
      />
      <Row
        classes="font-medium"
        label="Total monthly charge"
        value={on ? "$55.00" : "$50.00"}
      />
    </dl>
  );
}

/** the wallets are the vendors' own buttons in the real form (stripe's
 *  express checkout, paypal's sdk), cropped from the production form as one
 *  image. they keep the vendors' colours under a tenant accent, as they do in a
 *  real tenant's form. */
const Express = () => (
  <img
    src={express_buttons}
    width={487}
    height={151}
    alt=""
    className="mt-4 w-full h-auto"
  />
);

const BENEFITS = {
  stock: {
    heading: "Benefits of donating appreciated stock",
    teaser:
      "Donate stock directly and you may avoid capital gains tax while maximizing your charitable impact.",
  },
  crypto: {
    heading: "Benefits of donating appreciated crypto",
    teaser:
      "You can enjoy significant tax advantages and maximize the size of your contributions when you transfer crypto.",
  },
  ira_qcd: {
    heading: "Benefits of an IRA Qualified Charitable Distribution",
    teaser:
      "Donate directly from your IRA through a Qualified Charitable Distribution (QCD), which may provide meaningful tax advantages if eligible.",
  },
};

function Benefits({ subject }: { subject: keyof typeof BENEFITS }) {
  const c = BENEFITS[subject];
  return (
    <div className="mt-4 grid gap-y-2">
      <p className="flex items-center gap-x-1">
        <LightbulbIcon className="icon-sm stroke-warning shrink-0" />
        <span className="text-sm font-medium">{c.heading}</span>
      </p>
      <p className="text-sm mask-b-from-1 pb-2">{c.teaser}</p>
      <span className="flex items-center -mt-4 text-xs text-primary">
        read more <ChevronDown className="icon-md" />
      </span>
    </div>
  );
}

const Continue = ({ label = "Continue" }: { label?: string }) => (
  <span className="mt-2 btn btn-form-primary transition-colors">{label}</span>
);

const Cpf = () => (
  <Switch on={false} label="Cover 3rd party processing fees" classes="mt-1" />
);

interface IPanel {
  frame: IFrame;
  live: boolean;
}

function CardPanel({ frame, live }: IPanel) {
  return (
    <div className="flex flex-col gap-y-2">
      <Frequency value={frame.frequency} />
      <TokenAmount label="Donation amount" unit="USD" amount={frame.amount} />
      <Increments />
      {/* the button rides in each layer, so a shorter one leaves its slack
          below the button rather than between it and the wallets */}
      <Layers
        live={live}
        show={frame.tip === "hidden" ? "express" : "tip"}
        layers={{
          express: (
            <div className="grid content-start">
              <Cpf />
              <Express />
              <Continue label="Continue with Card" />
            </div>
          ),
          tip: (
            <div className="grid content-start">
              <TipField on={frame.tip === "on"} live={live} />
              <FeeSummary on={frame.tip === "on"} />
              <Continue label="Continue with Card" />
            </div>
          ),
        }}
      />
    </div>
  );
}

const PANELS: Record<TMethod, (p: IPanel) => ReactNode> = {
  stripe: CardPanel,
  stripe_bank: ({ frame }) => (
    <div className="flex flex-col gap-y-2">
      <Frequency value={frame.frequency} />
      <TokenAmount label="Donation amount" unit="USD" amount={frame.amount} />
      <Increments />
      <Cpf />
      <p className="mt-2 text-xs text-gray-11">
        0.8% fee, capped at $5 — save vs. card (2.2% + $0.30)
      </p>
      <Continue />
    </div>
  ),
  daf: ({ frame }) => (
    <div className="flex flex-col gap-y-2">
      <PlainField
        required
        label="Donation amount"
        value={frame.amount}
        placeholder="Enter amount (USD)"
      />
      <Increments />
      <Cpf />
      <Continue />
    </div>
  ),
  stocks: () => (
    <div className="flex flex-col gap-y-2">
      <TokenAmount label="Stock donation details" unit="AAPL" amount="10" />
      <Benefits subject="stock" />
      <Continue />
    </div>
  ),
  ira_qcd: ({ frame }) => (
    <div className="flex flex-col gap-y-2">
      <PlainField
        required
        label="Donation amount"
        value={frame.amount}
        placeholder="Enter amount (USD)"
      />
      <Increments />
      <PlainField
        label="IRA provider / custodian"
        placeholder="e.g. Fidelity, Schwab, Vanguard"
      />
      <Benefits subject="ira_qcd" />
      <Continue />
    </div>
  ),
  crypto: () => (
    <div className="flex flex-col gap-y-2">
      <TokenAmount label="Donation amount" unit="BTC" amount="0.001" />
      <Cpf />
      <Benefits subject="crypto" />
      <Continue />
    </div>
  ),
};

interface IThanks {
  live: boolean;
  reduced: boolean;
  /** the thank-you is showing: in the stage, its layer is mounted from the
   *  start, so the burst waits for this to mount and play */
  shown: boolean;
}

/** the success page's own moment (`routes/donations.$id`): the character with
 *  its confetti over the thank-you line, then the summary's monthly charge */
function Thanks({ live, reduced, shown }: IThanks) {
  return (
    <div className="grid content-center gap-6 p-6 @md/tour:p-10">
      <Laira
        pose="cheering"
        live={live}
        reduced={reduced}
        burst={shown}
        classes="relative h-32 justify-self-start"
      />
      <p className="text-xl/relaxed @md/tour:text-2xl/relaxed text-balance">
        Your generosity knows no bounds! Thank you for making a difference!
      </p>
      <div>
        <p className="flex items-center gap-2">
          <ListCheck className="icon-xl" />
          <span className="font-semibold text-sm">Your donation summary</span>
        </p>
        <dl className="mt-4 grid border-y divide-y divide-gray-6">
          <Row label="Total donation" value="$50.00" classes="py-3" />
          <Row
            label="Total monthly charge"
            value="$50.00"
            classes="py-3 font-medium"
          />
        </dl>
      </div>
    </div>
  );
}

interface IFormReplica {
  frame: IFrame;
  live: boolean;
  reduced: boolean;
  classes?: string;
}

export function FormReplica({
  frame,
  live,
  reduced,
  classes = "",
}: IFormReplica) {
  const methods = Object.keys(TABS) as TMethod[];
  const form = (
    <div className="grid @md/tour:grid-cols-[auto_1fr]">
      <p className="p-4 pb-0 col-span-full @md/tour:hidden label font-bold">
        Payment method
      </p>
      <div className="grid grid-cols-2 gap-2 p-4 content-start @md/tour:grid-cols-1 @md/tour:gap-0 @md/tour:p-0 @md/tour:border-e @md/tour:divide-y @md/tour:divide-background">
        {methods.map((m) => (
          <span
            key={m}
            className={`flex items-center gap-2 p-2 @md/tour:px-3 @md/tour:py-5 rounded @md/tour:rounded-none outline outline-form-secondary @md/tour:outline-0 transition-colors ${
              m === frame.method
                ? "bg-form-secondary text-gray-12"
                : "text-gray-11"
            }`}
          >
            {TABS[m].icon}
            <span className="text-start text-sm">
              {TABS[m].name}
              {m === "stripe_bank" && (
                <span className="block text-2xs leading-none font-medium text-primary">
                  Lowest fee
                </span>
              )}
            </span>
          </span>
        ))}
      </div>
      <Layers
        live={live}
        show={frame.method}
        classes="p-4 pt-0 @md/tour:p-6"
        layers={Object.fromEntries(
          methods.map((m) => {
            const Panel = PANELS[m];
            return [m, <Panel key={m} frame={frame} live={live} />];
          })
        )}
      />
    </div>
  );

  return (
    <div
      className={`${classes} @container/tour grid bg-surface rounded overflow-clip text-gray-12`}
    >
      <Layers
        live={live}
        show={frame.view}
        layers={{
          form,
          thanks: (
            <Thanks
              live={live}
              reduced={reduced}
              shown={frame.view === "thanks"}
            />
          ),
        }}
      />
    </div>
  );
}
