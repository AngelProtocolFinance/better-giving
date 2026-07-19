export type PayPalEnvironment = "sandbox" | "production";

export interface PayPalClientConfig {
  client_id: string;
  client_secret: string;
  environment?: PayPalEnvironment;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export class PayPalClient {
  private client_id: string;
  private client_secret: string;
  private base_url: string;
  private access_token?: string;
  private token_expiry?: number;

  constructor(config: PayPalClientConfig) {
    this.client_id = config.client_id;
    this.client_secret = config.client_secret;
    const env = config.environment || "sandbox";
    this.base_url =
      env === "production"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com";
  }

  private async fetch_new_token(): Promise<string> {
    const auth_string = Buffer.from(
      `${this.client_id}:${this.client_secret}`
    ).toString("base64");

    const response = await fetch(`${this.base_url}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${auth_string}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      const error_data = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      throw new Error(
        `Failed to get PayPal access token: ${
          (error_data.error_description as string) || response.statusText
        }`
      );
    }

    const data = (await response.json()) as TokenResponse;

    this.access_token = data.access_token;
    // set expiry time with 60 second buffer
    this.token_expiry = Date.now() + (data.expires_in - 60) * 1000;

    return this.access_token;
  }

  private is_token_expired(): boolean {
    if (!this.access_token || !this.token_expiry) {
      return true;
    }
    return Date.now() >= this.token_expiry;
  }

  async get_access_token(): Promise<string> {
    if (this.is_token_expired()) {
      return await this.fetch_new_token();
    }
    return this.access_token!;
  }

  /**
   * force refresh the access token
   */
  async refresh_token(): Promise<string> {
    return await this.fetch_new_token();
  }

  /**
   * get the current base URL (sandbox or production)
   */
  get_base_url(): string {
    return this.base_url;
  }

  /**
   * check if the client is configured for production
   */
  is_production(): boolean {
    return this.base_url.includes("api-m.paypal.com");
  }
}
