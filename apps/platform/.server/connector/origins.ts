type Env = {
  BASE_URL?: string;
  CONNECTOR_ORIGINS?: string;
};

export function request_origin(request: Request): string {
  return new URL(request.url).origin;
}

/**
 * `origin` equals the origin of `BASE_URL`, or one of the comma-separated
 * origins in `CONNECTOR_ORIGINS`. Paths are not origins and never match.
 */
export function origin_allowed(
  origin: string,
  env: Env = process.env
): boolean {
  const base = base_origin(env.BASE_URL);
  if (base && origin === base) return true;
  for (const allowed of listed_origins(env.CONNECTOR_ORIGINS)) {
    if (origin === allowed) return true;
  }
  return false;
}

function base_origin(base_url: string | undefined): string | null {
  const raw = base_url?.replace(/\/+$/, "");
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function listed_origins(list: string | undefined): string[] {
  if (!list) return [];
  return list
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
