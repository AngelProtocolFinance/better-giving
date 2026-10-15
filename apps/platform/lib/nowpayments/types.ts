/**
 * NOWPayments API.
 * Field types follow the published collection
 * https://documenter.getpostman.com/view/7907941/2s93JusNJt
 * and, where that collection and the live API disagree, both forms.
 */
export declare namespace NP {
  export namespace Payment {
    export type Status =
      /** Waiting for the customer to send the payment. The initial status of each payment. */
      | "waiting"
      /** The transaction is being processed on the blockchain. Appears when NOWPayments detects the funds from the user on the blockchain. */
      | "confirming"
      /** The process is confirmed by the blockchain. Customer's funds have accumulated enough confirmations. */
      | "confirmed"
      /** The funds are being sent to your personal wallet. NOWPayments is in the process of sending the funds to you. */
      | "sending"
      /** Shows that the customer sent less than the actual price. Appears when the funds have arrived in your wallet. */
      | "partially_paid"
      /** The funds have reached your personal address and the payment is finished. */
      | "finished"
      /** The payment wasn't completed due to an error of some kind. */
      | "failed"
      /** The funds were refunded back to the user. */
      | "refunded"
      /** The user didn't send the funds to the specified address within the 7-day time window. (20 min if fixed_rate) */
      | "expired";

    /** denominated in outcome_currency */
    export interface Fee {
      currency: string;
      depositFee: number;
      serviceFee: number;
      withdrawalFee: number;
    }

    export type TestCase = "success" | "common" | "failed" | "partially_paid";

    export interface Request {
      /** invoice id from create-invoice  */
      iid: string;
      pay_currency: string;
      order_description?: string;
      customer_email?: string;

      /** @ignore alternative address to receive funds */
      payout_address?: string;
      /** @ignore payout address */
      payout_extra_id?: string | null;
      /** @ignore (required if payout_address is specified) */
      payout_currency?: string;
      /** @ignore @internal */
      purchase_id?: string;

      /** @ignore - only used for testing */
      case?: TestCase;
    }
  }

  export interface Payment {
    payment_id: number;

    // order link to payment. both are null in the get-payment-status and IPN examples
    order_id: string | null;
    order_description: string | null;

    // to pay amount in usd
    price_amount: number;
    price_currency: string;

    // to pay amount in crypto
    pay_amount: number;
    pay_currency: string;
    pay_address: string;

    /** e.g. memo */
    payin_extra_id: string | null;

    payment_status: Payment.Status;
  }

  export interface PaymentStatus extends Payment {
    /** null in the published get-payment-status example; a number on the list endpoint */
    invoice_id: number | null;
    /**
     * a number in the get-payment-status example. create-payment's field table
     * says String, and the create and IPN examples are strings — see `NewPayment`
     * and `PaymentPayload`
     */
    purchase_id: number;

    actually_paid: number;

    /** iso */
    created_at: string;
    updated_at: string;

    outcome_amount: number;
    outcome_currency: string;

    /** tx: user wallet -> pay_address  */
    payin_hash: string | null;
    payout_hash: string | null;

    /**@ignore */
    type: string;
    /**
     * the get-payment-status example is the string `"null"`, not JSON null
     * @ignore
     */
    burning_percent: string;
  }

  export interface NewPayment extends Omit<Payment, "payment_id"> {
    payment_id: string;
    /** can add additional payments to this purchase_id */
    purchase_id: string;

    /** iso */
    created_at: string;
    /** iso */
    updated_at: string;

    ipn_callback_url: string;
    /**
     * create-payment's field table says String; the invoice field table says
     * Boolean for the same flags. the invoice-payment example omits both
     */
    is_fee_paid_by_user?: string | boolean;
    is_fixed_rate?: string | boolean;

    smart_contract: string | null;
    /**
     * create-payment's field table says String; the published example is `8`
     */
    network_precision: string | number | null;
    network: string;

    /** iso */
    expiration_estimate_date: string;
    /** iso. in the field table, absent from the published example */
    valid_until?: string;
    /** the field table says String; the published example is null */
    time_limit: string | null;

    /** the field table says Float; the published example is null */
    amount_received: number | null;
    /** in the field table, absent from the invoice-payment example */
    type?: string;
    /**@ignore the published example is JSON null */
    burning_percent: null;
  }

  export interface PaymentPayload extends Payment {
    /** null in the IPN example; a number on the list endpoint */
    invoice_id: number | null;
    /**
     * a string in the IPN example (`"123456789"`). the get-payment-status
     * example is a number — see `PaymentStatus`
     */
    purchase_id: string;

    actually_paid: number;
    actually_paid_at_fiat: number;

    outcome_amount: number;
    outcome_currency: string;
    fee: Payment.Fee;

    parent_payment_id: number | null;
    /**
     * null in the IPN example. the get-payment-status example is an array of
     * numbers (`[5513339153]`), the same shape as that endpoint's `payment_id`
     */
    payment_extra_ids: number[] | null;
  }

  /** `POST /v1/invoice`. `price_amount` is a String in the field table and `"1000"` in the example */
  export interface Invoice {
    id: string;
    token_id?: string;
    order_id: string;
    order_description: string;
    price_amount: string;
    price_currency: string;
    pay_currency: string | null;
    ipn_callback_url: string;
    invoice_url: string;
    success_url: string;
    cancel_url: string;
    partially_paid_url?: string;
    payout_currency?: string | null;
    created_at: string;
    updated_at: string;
    is_fixed_rate?: boolean;
    is_fee_paid_by_user?: boolean;
  }

  export namespace Invoice {
    interface Request {
      /** amount in fiat: currency - "usd, eur.." */
      price_amount: number;
      price_currency: string;

      /**amount in crypto: optional in api, but requried in our flows  */
      pay_currency: string;
      /** optional in api, but required in our flows  */
      ipn_callback_url: string;

      // optional in api: but required in our flows
      order_id: string;
      order_description: string;

      /// not used in our flows ///
      success_url?: string;
      cancel_url?: string;
      is_fixed_rate?: boolean;
      is_fee_paid_by_user?: boolean;
    }
  }

  /**
   * `GET /v1/estimate`. no field table. the published example's amounts are
   * JSON numbers; the live API quotes the same fields as decimal strings.
   * denominated `estimated_amount` is in `currency_to`.
   */
  export interface Estimate {
    currency_from: string;
    amount_from: string | number;
    currency_to: string;
    estimated_amount: string | number;
  }

  export namespace Estimate {
    interface Params {
      amount: string;
      currency_from: string;
      currency_to: string;
    }
  }

  /**
   * `GET /v1/min-amount`. the field table says Float and the example is a JSON
   * number. the live API returns decimal strings, same as `Estimate`.
   * `min_amount` is denominated in `currency_from`; `fiat_equivalent` in
   * `params.fiat_equivalent`.
   */
  export interface MinAmount {
    currency_from: string;
    currency_to: string;
    min_amount: string | number;
    fiat_equivalent?: string | number;
  }

  export namespace MinAmount {
    interface Params {
      currency_from: string;
      currency_to?: string;
      /** e.g. "usd, eur" */
      fiat_equivalent?: string;

      //not used in our flows
      is_fixed_rate?: boolean;
      is_fee_paid_by_user?: boolean;
    }
  }
}
