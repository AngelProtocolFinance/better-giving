import type Stripe from "stripe";
import { to_full_or_anonymous } from "../helpers/name";
import type { IDonationUpdate, IFrom, TStatus } from "./interfaces";
import type { IAmount, IDonor } from "./schema";

export const amnt_sum = ({ base, tip, fee_allowance: fa }: IAmount): number => {
  return base + tip + fa;
};
export const to_from = (donor: IDonor): IFrom => {
  return {
    from_email: donor.email,
    from_name: to_full_or_anonymous(donor.first_name, donor.last_name),
    from_title: donor.title,
    from_company_name: donor.company_name,
    from_addr_street: donor.address?.street,
    from_addr_city: donor.address?.city,
    from_addr_state: donor.address?.state,
    from_addr_zip_code: donor.address?.zip_code,
    from_addr_country: donor.address?.country,
  };
};

/**
 * the payer parts paypal reports. structural rather than borrowed from the sdk
 * because the two callers read two different paypal shapes — a capture
 * response's `payment_source.paypal|venmo` and a webhook event's payer — and
 * only these fields are common to both.
 */
export interface IPaypalPayer {
  email_address?: string;
  name?: { given_name?: string; surname?: string };
  address?: {
    address_line_1?: string;
    address_line_2?: string;
    /** state / province */
    admin_area_1?: string;
    /** city */
    admin_area_2?: string;
    postal_code?: string;
    country_code?: string;
  };
}

/**
 * what paypal knows about the payer, as a donation patch.
 *
 * every part is optional and independently present, so each is written only
 * when it arrives — the address excepted, which is written as a unit.
 */
export const paypal_donor_update = (payer: IPaypalPayer): IDonationUpdate => {
  const { email_address: email, name, address: addr } = payer;
  const update: IDonationUpdate = {};

  if (email) update.from_email = email;

  // guard the raw parts — `to_full_or_anonymous` defaults to "Anonymous",
  // which would clobber the form-entered name recorded at intent time
  if (name?.given_name || name?.surname) {
    update.from_name = to_full_or_anonymous(name.given_name, name.surname);
  }

  // the address is ONE value, not five. `donation_update` patches the addr
  // jsonb key by key, so writing the parts independently merges paypal's
  // record into whatever the donor typed at intent time — a payer carrying
  // only a country stamps it onto the form's street, city and zip, and the tax
  // receipt then names an address that belongs to nobody. so paypal's address
  // replaces the stored one whole, or none of it is touched; the empty strings
  // are what clear a part paypal does not have, and every consumer filters
  // them out. `street || city` is the same has-an-address test
  // `.server/pg/queries/donation` runs on the way in.
  const street = [addr?.address_line_1, addr?.address_line_2]
    .filter(Boolean)
    .join(" ");
  if (street || addr?.admin_area_2) {
    update.from_addr_street = street;
    update.from_addr_city = addr?.admin_area_2 ?? "";
    update.from_addr_state = addr?.admin_area_1 ?? "";
    update.from_addr_zip_code = addr?.postal_code ?? "";
    update.from_addr_country = addr?.country_code ?? "";
  }

  return update;
};

export const status_flags: { [key in TStatus]: string } = {
  // visible status
  intent: "10",
  // invisible status
  refunded: "06",
  settled: "05",
  confirmed: "04",
  created: "03",
  failed: "02",
  refunded_loss: "06",
  cancelled: "01",
  expired: "00",
};

export const via_name = (via: string): string => {
  if (via.startsWith("crypto")) return "Crypto";
  if (via.startsWith("chariot") || via === "daf") return "DAF";
  if (via.startsWith("paypal")) return "PayPal";
  if (via === "cheque") return "Cheque";
  // the employer's own gift, not the donor's. named rather than left as the raw
  // token because this label reaches the donor, the nonprofit and zapier — the
  // token itself is what `match_funnel` filters on and means nothing outside pg.
  if (via === "match") return "Employer match";
  if (via === "stocks") return "Stocks";
  if (via === "unknown") return "Unknown";
  if (via.startsWith("stripe")) {
    const [_, method] = via.split(":");
    switch (method as Stripe.PaymentMethod.Type) {
      // Cards
      case "card":
      case "card_present":
        return "Card";
      case "kr_card":
        return "Card (Korea)";

      // Digital Wallets
      case "link":
        return "Link";
      case "paypal":
        return "PayPal";
      case "amazon_pay":
        return "Amazon Pay";
      case "cashapp":
        return "Cash App";
      case "revolut_pay":
        return "Revolut Pay";
      case "samsung_pay":
        return "Samsung Pay";

      // Bank Transfers & Direct Debits
      case "us_bank_account":
        return "Bank Transfer (US)";
      case "acss_debit":
        return "Bank Debit (Canada)";
      case "au_becs_debit":
        return "Bank Debit (Australia)";
      case "bacs_debit":
        return "Bank Debit (UK)";
      case "sepa_debit":
        return "Bank Debit (SEPA)";
      case "pay_by_bank":
        return "Bank Transfer";

      // Buy Now Pay Later
      case "affirm":
        return "Affirm";
      case "afterpay_clearpay":
        return "Afterpay/Clearpay";
      case "alma":
        return "Alma";
      case "klarna":
        return "Klarna";
      case "zip":
        return "Zip";

      // Regional Payment Methods - Europe
      case "bancontact":
        return "Bancontact";
      case "blik":
        return "BLIK";
      case "eps":
        return "EPS";
      case "giropay":
        return "Giropay";
      case "ideal":
        return "iDEAL";
      case "mobilepay":
        return "MobilePay";
      case "multibanco":
        return "Multibanco";
      case "p24":
        return "Przelewy24";
      case "sofort":
        return "Sofort";
      case "swish":
        return "Swish";
      case "twint":
        return "TWINT";

      // Regional Payment Methods - Asia Pacific
      case "alipay":
        return "Alipay";
      case "wechat_pay":
        return "WeChat Pay";
      case "grabpay":
        return "GrabPay";
      case "kakao_pay":
        return "Kakao Pay";
      case "naver_pay":
        return "Naver Pay";
      case "payco":
        return "PAYCO";
      case "paynow":
        return "PayNow";
      case "fpx":
        return "FPX";
      case "promptpay":
        return "PromptPay";

      // Regional Payment Methods - Latin America
      case "boleto":
        return "Boleto";
      case "oxxo":
        return "OXXO";
      case "pix":
        return "Pix";

      // Other
      case "konbini":
        return "Konbini";
      case "customer_balance":
        return "Customer Balance";
      case "interac_present":
        return "Interac";

      default:
        return "Stripe";
    }
  }
  return via;
};

export const partition = ({
  tip,
  fee_allowance,
  base,
}: IAmount): /**  partition based on original proportions of IAmount */
((total_to_partition: number) => IAmount) => {
  const total = base + tip + fee_allowance;

  const tr = tip / total;
  const far = fee_allowance / total;

  return (num) => {
    const tip = num * tr;
    const fa = num * far;
    const base = num - tip - fa;
    return { tip, base, fee_allowance: fa };
  };
};

export const is_paid = (status: TStatus): status is "confirmed" | "settled" => {
  return status === "confirmed" || status === "settled";
};
