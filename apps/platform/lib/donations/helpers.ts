import type Stripe from "stripe";
import { to_full } from "../helpers/name";
import type { IFrom, TStatus } from "./interfaces";
import type { IAmount, IDonor } from "./schema";

export const amnt_sum = ({ base, tip, fee_allowance: fa }: IAmount): number => {
  return base + tip + fa;
};
export const to_from = (donor: IDonor): IFrom => {
  return {
    from_email: donor.email,
    from_name: to_full(donor.first_name, donor.last_name),
    from_title: donor.title,
    from_company_name: donor.company_name,
    from_addr_street: donor.address?.street,
    from_addr_city: donor.address?.city,
    from_addr_state: donor.address?.state,
    from_addr_zip_code: donor.address?.zip_code,
    from_addr_country: donor.address?.country,
  };
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
