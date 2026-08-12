import { href } from "react-router";

export interface IDonationDest {
  /** where the donor lands once the donation is through */
  url: string;
  /** the merchant's own `success_redirect` rather than our receipt. their
   * origin, their framing rules, their conversion pixel — which is why
   * everything downstream treats the two differently. */
  is_custom: boolean;
}

export interface IDonationReturnUrl {
  /** id of the donation row our own receipt route reads */
  donation_id: string;
  base_url: string;
  success_redirect?: string | null;
  /** what the donor paid, in `currency`, as the rail counts it */
  amount: number | string;
  currency: string;
  /** the rail it came in on — "card", "daf", "crypto", a wallet's
   * `expressPaymentType`, paypal's payment-source key */
  payment_method: string;
  /** name parts in display order; whatever the rail happens to know */
  donor_name?: (string | undefined)[];
}

/** the one place the post-donation destination is decided. every rail used to
 * re-derive this, and they disagreed on the donor's name. */
export function donation_return_url(x: IDonationReturnUrl): IDonationDest {
  const custom = x.success_redirect;
  const url = custom
    ? new URL(custom)
    : new URL(`${x.base_url}${href("/donations/:id", { id: x.donation_id })}`);

  // params are the merchant's contract for their own page. our receipt reads
  // the donation row instead, so it gets none of them.
  if (custom) {
    url.searchParams.set("donation_amount", x.amount.toString());
    url.searchParams.set("donation_currency", x.currency);
    url.searchParams.set("payment_method", x.payment_method);
    // omitted rather than sent empty or invented: this lands in someone's
    // "Thank you, ___" verbatim.
    const name = (x.donor_name ?? [])
      .map((p) => p?.trim())
      .filter(Boolean)
      .join(" ");
    if (name) url.searchParams.set("donor_name", name);
  }

  return { url: url.toString(), is_custom: !!custom };
}
