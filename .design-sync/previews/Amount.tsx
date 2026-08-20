import { Amount } from "@better-giving/ui";

export const Usd = () => <Amount amount={1200} currency="usd" />;

export const WithUsdEquivalent = () => (
  <div className="flex flex-col gap-2 items-start">
    <Amount amount={0.42} currency="eth" amount_usd={1284.5} />
    <Amount amount={250} currency="gbp" amount_usd={318.75} />
    <Amount amount={18000} currency="jpy" amount_usd={121.4} />
  </div>
);

export const Cents = () => (
  <div className="flex flex-col gap-2 items-start">
    <Amount amount={25} currency="usd" />
    <Amount amount={1200.5} currency="usd" />
    <Amount amount={1250000} currency="usd" />
  </div>
);

export const WithChips = () => (
  <Amount
    amount={500}
    currency="usd"
    chips={[
      <span
        key="recurring"
        className="text-2xs uppercase tracking-badge rounded bg-muted text-muted-fg px-1.5 py-0.5"
      >
        Monthly
      </span>,
    ]}
  />
);
