import { Elements } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { stripe_promise } from "../../../common/stripe";
import type { IStripeExpress } from "../use-rhf";
import { Content, type IContentExternal } from "./content";

interface Props extends IStripeExpress, IContentExternal {
  validate: () => Promise<boolean>;
}

export function ExpressCheckout({
  classes = "",
  items,
  validate,
  ...p
}: Props) {
  const c = p.currency.toLowerCase();
  const opts: StripeElementsOptions =
    p.frequency !== "one-time"
      ? { mode: "setup", currency: c }
      : { mode: "payment", amount: p.total_atomic, currency: c };

  return (
    <Elements stripe={stripe_promise} options={opts}>
      <Content
        classes={classes}
        on_click={async ({ resolve, reject }) => {
          const valid = await validate();
          if (!valid) return reject();

          resolve(
            p.frequency !== "one-time"
              ? {
                  lineItems: items.map((x) => ({
                    name: x.name,
                    amount: x.amount_atomic,
                  })),
                }
              : undefined
          );
        }}
        {...p}
      />
    </Elements>
  );
}
