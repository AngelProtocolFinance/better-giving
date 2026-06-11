import type { ReactNode } from "react";
import { humanize, ru_vdec, usdpu } from "@/helpers/decimal";

interface IAmount {
  amount: number;
  currency: string;
  amount_usd?: number | null;
  chips?: ReactNode[];
  classes?: string;
}

export function Amount({
  amount,
  currency,
  amount_usd,
  chips,
  classes = "",
}: IAmount) {
  const c = currency.toUpperCase();
  const has_usd = amount_usd != null;
  const formatted = has_usd
    ? ru_vdec(amount, usdpu(amount, amount_usd))
    : humanize(amount);
  return (
    <span className={`inline-flex items-baseline gap-x-1.5 ${classes}`}>
      <span className="text-2xs font-medium text-muted-fg">{c}</span>
      <span className="tabular-nums">{formatted}</span>
      {has_usd && c !== "USD" && (
        <span className="text-xs text-muted-fg tabular-nums">
          ${humanize(amount_usd, 2)}
        </span>
      )}
      {chips}
    </span>
  );
}
