import { Amount } from "@better-giving/ui";

// Amount takes ALREADY-FORMATTED strings — it never rounds. the app's
// src/components/money.tsx does the formatting (`usdpu` picks the primary
// figure's decimals from its usd magnitude) and wraps this. the values below
// are what that wrapper emits for each case, so the cards show real output.

export const Usd = () => <Amount value="1,200.00" currency="usd" />;

export const WithUsdEquivalent = () => (
  <div className="flex flex-col gap-2 items-start">
    {/* decimals differ per row on purpose: they follow each currency's usd
        magnitude, which is exactly why formatting is the app's job */}
    <Amount value="0.42" currency="eth" usd="1,284.50" />
    <Amount value="250.00" currency="gbp" usd="318.75" />
    <Amount value="18,000" currency="jpy" usd="121.40" />
  </div>
);

export const Cents = () => (
  <div className="flex flex-col gap-2 items-start">
    <Amount value="25.00" currency="usd" />
    <Amount value="1,200.50" currency="usd" />
    <Amount value="1,250,000.00" currency="usd" />
  </div>
);

export const WithChips = () => (
  <Amount
    value="500.00"
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
