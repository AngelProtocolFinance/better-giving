import { currency_precision } from "#/helpers/stripe";
import type { ICurrencyFv } from "#/types/components";
import { humanize, snap } from "@/helpers/decimal";

type Props = { classes?: string; amount: string | number };
export function currency({ rate, code }: ICurrencyFv) {
  const CODE = code.toUpperCase();
  const precision = currency_precision(CODE);
  return function Amount({ classes = "", amount: raw }: Props) {
    // a sum of cent amounts drifts below the cent (2.3 + 0.36 is
    // 2.6599999999999997), which humanize's truncation would read as 2.65
    const amount = snap(+raw);
    return (
      <dd className={`${classes} text-right`}>
        {CODE === "USD"
          ? `$${humanize(amount, 2)}`
          : rate
            ? `${CODE} ${humanize(amount, precision)} ($${humanize(
                +amount * (1 / rate),
                2
              )})`
            : `${CODE} ${humanize(amount, precision)}`}
      </dd>
    );
  };
}
