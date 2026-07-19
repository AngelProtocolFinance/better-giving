import {
  type CancelSubscriptionRequest,
  type CaptureOrderResponse,
  type CreateOrderRequest,
  type CreateOrderResponse,
  type CreatePlanRequest,
  type CreatePlanResponse,
  type CreateProductRequest,
  type CreateProductResponse,
  type CreateSubscriptionRequest,
  type CreateSubscriptionResponse,
  cancel_subscription_path,
  capture_order_path,
  create_order_path,
  create_plan_path,
  create_product_path,
  create_subscription_path,
  deactivate_plan_path,
  type GetOrderResponse,
  type GetPlanResponse,
  type GetPlansParams,
  type GetPlansResponse,
  type GetSubscriptionResponse,
  get_order_path,
  get_plan_path,
  get_plans_path,
  get_subscription_path,
  type IAccessTokenRes,
  type ISdkConfig,
  oauth_token_path,
} from "./interfaces.js";

export class PayPalSDK {
  private config: ISdkConfig;
  private access_token?: string;
  private token_expiry?: number;

  constructor(config: ISdkConfig) {
    this.config = config;
  }

  /**
   * get access token using client credentials
   */
  private async get_access_token(): Promise<string> {
    // return cached token if still valid
    if (
      this.access_token &&
      this.token_expiry &&
      Date.now() < this.token_expiry
    ) {
      return this.access_token;
    }

    const auth = Buffer.from(
      `${this.config.client_id}:${this.config.client_secret}`
    ).toString("base64");

    const response = await globalThis.fetch(
      `${this.config.api_url}${oauth_token_path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Failed to get access token: ${response.status} ${error}`
      );
    }

    const data = (await response.json()) as IAccessTokenRes;
    this.access_token = data.access_token;
    // set expiry with 60 second buffer
    this.token_expiry = Date.now() + (data.expires_in - 60) * 1000;

    return this.access_token;
  }

  /**
   * create an order
   */
  async create_order(
    order_data: CreateOrderRequest
  ): Promise<CreateOrderResponse> {
    const token = await this.get_access_token();

    const response = await globalThis.fetch(
      `${this.config.api_url}${create_order_path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(order_data),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create order: ${response.status} ${error}`);
    }

    return (await response.json()) as CreateOrderResponse;
  }

  /**
   * get an order by ID
   */
  async get_order(order_id: string): Promise<GetOrderResponse> {
    const token = await this.get_access_token();

    const path = get_order_path.replace("{id}", order_id);
    const response = await globalThis.fetch(`${this.config.api_url}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get order: ${response.status} ${error}`);
    }

    return (await response.json()) as GetOrderResponse;
  }

  /**
   * capture an order by ID
   */
  async capture_order(order_id: string): Promise<CaptureOrderResponse> {
    const token = await this.get_access_token();

    const path = capture_order_path.replace("{id}", order_id);
    const response = await globalThis.fetch(`${this.config.api_url}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to capture order: ${response.status} ${error}`);
    }

    return (await response.json()) as CaptureOrderResponse;
  }

  /**
   * create a product
   */
  async create_product(
    product_data: CreateProductRequest
  ): Promise<CreateProductResponse> {
    const token = await this.get_access_token();

    const response = await globalThis.fetch(
      `${this.config.api_url}${create_product_path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(product_data),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create product: ${response.status} ${error}`);
    }

    return (await response.json()) as CreateProductResponse;
  }

  /**
   * create a billing plan
   */
  async create_plan(plan_data: CreatePlanRequest): Promise<CreatePlanResponse> {
    const token = await this.get_access_token();

    const response = await globalThis.fetch(
      `${this.config.api_url}${create_plan_path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(plan_data),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create plan: ${response.status} ${error}`);
    }

    return (await response.json()) as CreatePlanResponse;
  }

  /**
   * list billing plans
   */
  async get_plans(params?: GetPlansParams): Promise<GetPlansResponse> {
    const token = await this.get_access_token();

    const url = new URL(`${this.config.api_url}${get_plans_path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      }
    }

    const response = await globalThis.fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get plans: ${response.status} ${error}`);
    }

    return (await response.json()) as GetPlansResponse;
  }

  /**
   * get a single billing plan by ID
   */
  async get_plan(plan_id: string): Promise<GetPlanResponse> {
    const token = await this.get_access_token();

    const path = get_plan_path.replace("{id}", plan_id);
    const response = await globalThis.fetch(`${this.config.api_url}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get plan: ${response.status} ${error}`);
    }

    return (await response.json()) as GetPlanResponse;
  }

  /**
   * deactivate a billing plan
   */
  async deactivate_plan(plan_id: string): Promise<void> {
    const token = await this.get_access_token();

    const path = deactivate_plan_path.replace("{id}", plan_id);
    const response = await globalThis.fetch(`${this.config.api_url}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to deactivate plan: ${response.status} ${error}`);
    }

    // 204 No Content - no response body
  }

  /**
   * create a subscription
   */
  async create_subscription(
    subscription_data: CreateSubscriptionRequest
  ): Promise<CreateSubscriptionResponse> {
    const token = await this.get_access_token();

    const response = await globalThis.fetch(
      `${this.config.api_url}${create_subscription_path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(subscription_data),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Failed to create subscription: ${response.status} ${error}`
      );
    }

    return (await response.json()) as CreateSubscriptionResponse;
  }

  /**
   * get a subscription by ID
   */
  async get_subscription(
    subscription_id: string
  ): Promise<GetSubscriptionResponse> {
    const token = await this.get_access_token();

    const path = get_subscription_path.replace("{id}", subscription_id);
    const response = await globalThis.fetch(`${this.config.api_url}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Failed to get subscription: ${response.status} ${error}`
      );
    }

    return (await response.json()) as GetSubscriptionResponse;
  }

  /**
   * cancel a subscription
   */
  async cancel_subscription(
    subscription_id: string,
    cancel_data: CancelSubscriptionRequest
  ): Promise<void> {
    const token = await this.get_access_token();

    const path = cancel_subscription_path.replace("{id}", subscription_id);
    const response = await globalThis.fetch(`${this.config.api_url}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cancel_data),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Failed to cancel subscription: ${response.status} ${error}`
      );
    }

    // 204 No Content - no response body
  }
}
