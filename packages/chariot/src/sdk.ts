import {
  type CreateGrantRequest,
  create_grant_path,
  type Grant,
  get_grant_path,
  type ISdkConfig,
} from "./interfaces.js";

/** a non-2xx from the chariot api */
export class ChariotError extends Error {
  /** the error body's own description, when it carries one */
  readonly reason: string | undefined;

  constructor(
    readonly http_status: number,
    readonly body: string,
    readonly request_id: string | null
  ) {
    super(`Chariot API error: ${http_status} ${body}`);
    this.name = "ChariotError";
    this.reason = reason_of(body);
  }
}

// the vendored spec's error carries `message`; an rfc 7807 problem carries `detail`
function reason_of(body: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object") return;
    const { message, detail } = parsed as Record<string, unknown>;
    return [message, detail].find(
      (x): x is string => typeof x === "string" && x.trim() !== ""
    );
  } catch {
    return;
  }
}

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
      throw new ChariotError(
        response.status,
        await response.text(),
        response.headers.get("x-request-id")
      );
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
