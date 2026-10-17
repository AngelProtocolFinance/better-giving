type Env = {
  VERCEL_ENV?: string;
  CONNECTOR_RETURN_URL?: string;
};

export const PRODUCTION_RETURN_URL =
  "https://app.connect.better.giving/connect/return";

/**
 * Production ignores `CONNECTOR_RETURN_URL`: a mis-set env must not move
 * the browser off the real app. Anywhere else, an absolute http(s) override
 * wins, and a missing or non-http value falls back to production.
 */
export function connector_return_url(env: Env = process.env): string {
  if (env.VERCEL_ENV === "production") return PRODUCTION_RETURN_URL;
  const configured = env.CONNECTOR_RETURN_URL?.trim();
  if (configured && is_http_url(configured)) return configured;
  return PRODUCTION_RETURN_URL;
}

function is_http_url(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
