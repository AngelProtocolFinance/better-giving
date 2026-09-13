class Resp {
  json(x: object, status = 200, headers?: Record<string, string>) {
    return new Response(JSON.stringify(x), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  }
  status(status: number, text?: string): Response {
    text && console.info(`[resp] ${status} - ${text}`);
    return new Response(text, { status, statusText: text });
  }
  /** a failure the client reads off `fetcher.data`. json, so the status
   * survives the boundary — react-router hands a bare `Response` body to the
   * client as text only, and `is_user_error` needs the status to keep a 4xx
   * off sentry. */
  fail(status: number, message: string) {
    return this.json({ status, message }, status);
  }
  txt(x: string, status = 200): Response {
    return new Response(x, {
      status,
      headers: { "content-type": "text/plain" },
    });
  }
  err(status: number, x: string): Response {
    return this.txt(x, status);
  }
}

export const resp = new Resp();

/** `status` is what `is_user_error` reads to keep a 4xx off sentry */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/**
 * parsed body of an ok response; otherwise throws `HttpError`. only a
 * `text/plain` 4xx body becomes the message — the shape our routes answer a
 * refusal in; an edge/firewall html page or any 5xx leaves it empty, and the
 * caller decides whether to show it.
 */
export async function json_ok<T>(res: Response): Promise<T> {
  if (res.ok) return res.json();
  const is_text =
    res.status < 500 &&
    (res.headers.get("content-type") ?? "").startsWith("text/plain");
  const txt = is_text ? (await res.text().catch(() => "")).trim() : "";
  throw new HttpError(res.status, txt);
}

type R = { [k: string]: string | undefined };

export function search<T extends { [k: string]: string }>(
  search: URLSearchParams
): T;
export function search<T extends R>(request: Request): T;
export function search<T extends R>(url: URL): T;
export function search<T extends R>(search: URLSearchParams): T;
export function search<T extends R>(url_str: string): T;
export function search<T extends R>(
  input: Request | URLSearchParams | URL | string
): T {
  let x: URLSearchParams;
  if (input instanceof URLSearchParams) {
    x = input;
  } else if (input instanceof Request) {
    x = new URL(input.url).searchParams;
  } else if (input instanceof URL) {
    x = input.searchParams;
  } else {
    x = new URL(input).searchParams;
  }
  return Object.fromEntries(x.entries()) as T;
}

export const sans_https = (x: string | null | undefined) =>
  x?.replace(/^https:\/\//, "");
