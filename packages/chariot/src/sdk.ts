import {
  type CreateGrantRequest,
  create_grant_path,
  type Grant,
  get_grant_path,
  type ISdkConfig,
} from "./interfaces.js";

export class Chariot {
  private config: ISdkConfig;

  constructor(config: ISdkConfig) {
    this.config = config;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await globalThis.fetch(`${this.config.api_url}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.config.api_key}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Chariot API error: ${response.status} ${error}`);
    }

    return (await response.json()) as T;
  }

  async get_grant(id: string): Promise<Grant> {
    const path = get_grant_path.replace("{id}", id);
    return this.request<Grant>(path);
  }

  async create_grant(data: CreateGrantRequest): Promise<Grant> {
    return this.request<Grant>(create_grant_path, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
}
