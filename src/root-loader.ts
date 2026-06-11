import { addDays } from "date-fns";
import { data, type LoaderFunctionArgs } from "react-router";
import { reg_cookie } from "#/.server/cookie";
import { getToast } from "#/.server/toast";
import { search } from "@/helpers/https";

// only sets cookie when value changes to allow Vercel CDN caching
async function append_referrer(
  referrer: string,
  cookie_header: string
): Promise<string | null> {
  const rc = await reg_cookie.parse(cookie_header).then((x) => x || {});

  // Already has this referrer
  if (rc.referrer === referrer) return null;

  // Has different unexpired referrer - keep the original
  if (rc.referrer && rc.referrer_expiry) {
    const expiry = new Date(rc.referrer_expiry);
    if (expiry > new Date()) return null;
  }

  // Set new referrer
  rc.referrer = referrer;
  rc.referrer_expiry = addDays(new Date(), 90).toISOString();
  return reg_cookie.serialize(rc);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const { referrer } = search(url);
  const cookie_header = request.headers.get("cookie");

  const rc =
    referrer && cookie_header
      ? await append_referrer(referrer, cookie_header)
      : null;

  // getToast always commits the session (emits Set-Cookie). only call it when
  // an incoming toast cookie exists, so cold requests stay CDN-cacheable.
  const has_toast_cookie = cookie_header?.includes("bg-toast=") ?? false;
  const { toast, headers: toast_headers } = has_toast_cookie
    ? await getToast(request)
    : { toast: undefined, headers: new Headers() };

  const headers = new Headers();
  if (rc) headers.append("set-cookie", rc);
  // forward toast session commit whenever the cookie was present, even if no
  // active toast — otherwise a stale/consumed bg-toast cookie never clears and
  // the user is stuck off-CDN on every request.
  if (has_toast_cookie) {
    for (const v of toast_headers.getSetCookie()) {
      headers.append("set-cookie", v);
    }
  }
  const has_headers = !!rc || has_toast_cookie;
  return data({ toast }, has_headers ? { headers } : undefined);
};
