import { Amount } from "@better-giving/ui";
import type { ReactNode } from "react";
import { humanize, ru_vdec, usdpu } from "@/helpers/decimal";

interface IMoney {
  amount: number;
  currency: string;
  amount_usd?: number | null;
  chips?: ReactNode[];
  classes?: string;
}

/**
 * the app's money figure: raw numbers in, design-system `Amount` out. the
 * formatting lives here and not in the system because precision is a domain
 * rule — `usdpu` picks the primary figure's decimals from its usd magnitude,
 * so a 0.00001234 BTC line and a $12.34 line round differently.
 */
export function Money({
  amount,
  currency,
  amount_usd,
  chips,
  classes,
}: IMoney) {
  const has_usd = amount_usd != null;
  return (
    <Amount
      value={
        has_usd ? ru_vdec(amount, usdpu(amount, amount_usd)) : humanize(amount)
      }
      currency={currency}
      usd={has_usd ? humanize(amount_usd, 2) : undefined}
      chips={chips}
      classes={classes}
    />
  );
}
