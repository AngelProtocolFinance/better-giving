export interface DisplayField {
  key: string;
  label: string;
  value: string;
}

export interface Name {
  fullName: string;
}

/** https://docs.wise.com/api-docs/api-reference/recipient#object */
export interface V2RecipientAccount {
  id: number;
  name: Name;
  accountNumber?: number;
  longAccountSummary: string;
  displayFields: DisplayField[];
  address?: Record<string, any>;
  details: Record<string, any>;
  currency: string;
  country: string; //country code
  type: string;
  legalEntityType: "PERSON" | "BUSINESS";
}

export interface Config {
  apiToken: string;
  sandbox?: boolean;
}

/** https://docs.wise.com/api-docs/api-reference/balance#get */
export interface Balance {
  id: number;
  /** 3 letter iso - uppercase */
  currency: string;
  totalWorth: { value: number };
}

namespace Req {
  /** @link https://docs.wise.com/api-docs/api-reference/quote#create */
  export interface Quote {
    sourceCurrency: "USD";
    targetCurrency: string;
    sourceAmount: number;
    targetAmount: null;
    payOut: null;
    preferredPayIn: null;
    targetAccount: string;
  }

  /** @link https://docs.wise.com/api-docs/api-reference/transfer#create */
  export interface Transfer {
    targetAccount: string;
    quoteUuid: string;
    /** in uuid format */
    customerTransactionId: string;
    details: {
      transferPurpose: "verification.transfers.purpose.other";
      sourceOfFunds: "verification.source.of.funds.other";
    };
  }

  /** @link https://docs.wise.com/api-docs/api-reference/transfer#fund */
  export interface Fund {
    type: "BALANCE";
  }
}

namespace Res {
  /**
   * Quote.id is in UUID format
   * @link https://docs.wise.com/api-docs/api-reference/quote#object
   */
  export interface Quote {
    id: string;
  }

  /**
   * Transfer.id is an integer
   * @link https://docs.wise.com/api-docs/api-reference/transfer#object
   */
  export interface Transfer {
    id: number;
    /** Optional but present when a transfer error occurs */
    errors?: any;
  }

  /** @link https://docs.wise.com/api-docs/api-reference/transfer#fund */
  export interface Fund {
    status: "COMPLETED" | "REJECTED";
    errorCode?: string;
  }
}

export class Wise {
  headers: Record<string, string>;
  base_url: string;
  config: Config;

  constructor(config: Config) {
    this.config = config;
    this.headers = {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiToken}`,
    };
    this.base_url = config.sandbox
      ? "https://api.sandbox.transferwise.tech"
      : "https://api.wise.com";
  }

  private async to_json<T = unknown>(res: Response): Promise<T> {
    if (!res.ok) throw await res.text();
    return res.json() as T;
  }

  async v2_account(id: number): Promise<V2RecipientAccount> {
    const res = await fetch(`${this.base_url}/v2/accounts/${id}`, {
      headers: this.headers,
    });
    return this.to_json(res);
  }

  async balance(id: number, profile_id: number): Promise<Balance> {
    const res = await fetch(
      `${this.base_url}/v4/profiles/${profile_id}/balances/${id}`,
      { headers: this.headers }
    );
    return this.to_json(res);
  }

  async quote(profile_id: string, payload: Req.Quote): Promise<Res.Quote> {
    const url = `${this.base_url}/v3/profiles/${profile_id}/quotes`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw await res.text();
    return this.to_json(res);
  }

  async transfer(payload: Req.Transfer): Promise<Res.Transfer> {
    const url = `${this.base_url}/v1/transfers`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw await res.text();
    return this.to_json(res);
  }

  async fund_transfer(
    transfer_id: number,
    profile_id: number,
    payload: Req.Fund
  ): Promise<Res.Fund> {
    const url = `${this.base_url}/v3/profiles/${profile_id}/transfers/${transfer_id}/payments`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw await res.text();
    return this.to_json(res);
  }
}
