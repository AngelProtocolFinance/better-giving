// react-router framework server entry — path is fixed at `src/entry.server.tsx`.
// rr discovers it via convention and calls the default export per request.
// required exports (names matter, rr looks them up):
//   - default: (request, status, headers, routerContext, loadContext) => Response | Promise<Response>
//   - streamTimeout?: number — abort renderToPipeableStream after N ms
//   - handleError?: (error, { request, params, context }) => void — fires on loader/action throws
// runs on the vercel node runtime; full process.env is available (no VITE_ prefix needed).
// vercel auto-injects: VERCEL_ENV, VERCEL_DEPLOYMENT_ID, VERCEL_SKEW_PROTECTION_ENABLED, VERCEL_GIT_COMMIT_SHA.
// docs:
//   rr entry.server:   https://reactrouter.com/api/framework-conventions/entry.server.tsx
//   sentry server:     https://docs.sentry.io/platforms/javascript/guides/react-router/
//   vercel skew prot:  https://vercel.com/docs/skew-protection
//   vercel system env: https://vercel.com/docs/environment-variables/system-environment-variables
import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import * as Sentry from "@sentry/react-router";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";
import {
  type AppLoadContext,
  createCookie,
  type EntryContext,
  type href,
  matchPath,
  ServerRouter,
} from "react-router";
import { report_error } from "@/errors/report";

// SENTRY_DSN: set in vercel project env (server-side, no VITE_ prefix).
// only report from prod — preview/dev noise drowns out real signal.
// VERCEL_ENV: auto-injected by vercel ("production" | "preview" | "development").
// STAGE: project-defined fallback for non-vercel envs.
const env = process.env.VERCEL_ENV ?? process.env.STAGE;
const dsn = process.env.SENTRY_DSN;
if (dsn && env === "production") {
  Sentry.init({
    dsn,
    environment: env,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}

export const streamTimeout = 5_000;

// vercel skew protection — pins client to the deployment that served its assets.
// both vars are auto-injected by vercel when skew protection is enabled on the project.
// docs: https://vercel.com/docs/skew-protection
const vercel_deployment_id = process.env.VERCEL_DEPLOYMENT_ID;
const vercel_skew_protection_enabled =
  process.env.VERCEL_SKEW_PROTECTION_ENABLED === "1";

const vdpl_cookie = createCookie("__vdpl", {
  path: "/",
  httpOnly: true,
  secure: true,
  sameSite: "lax",
});

// public/embed routes that set `cache-control: public, s-maxage=...` in their
// `headers` export. these benefit most from cdn caching, and a `set-cookie`
// makes vercel's cdn skip the cache entirely. skip __vdpl on these paths so
// the cdn can serve cached html. `satisfies` ties each literal to a real
// route in `routes.ts` via href's type system — adding/removing a route here
// fails the build if the pattern doesn't exist.
//
// to refresh this list, grep route `headers()` exports for cacheable values:
//   rg -l "cache-control.*public.*s-maxage" src/routes
// then add the matching url pattern (not the file path) below.
const SKIP_VDPL_PATHS = [
  "/",
  "/forms/:id",
  "/blog",
  "/blog/:slug",
  "/marketplace",
  "/marketplace/filter",
  "/marketplace/:id",
  "/marketplace/:id/program/:program_id",
  "/fundraisers",
  "/fundraisers/:fund_id",
  "/nonprofits/:slug",
  // landing
  "/donation-forms",
  "/fiscal-sponsorship",
  "/fund-management",
  "/giving-tuesday",
  // static marketing
  "/about-us",
  "/donor",
  "/nonprofit",
  "/donation-calculator",
  "/privacy-policy",
  "/security-policy",
  "/resources",
  "/wp-plugin",
  "/zapier-integration",
  "/terms-of-use",
  "/terms-of-use-npo",
  "/terms-of-use-referrals",
  "/terms-of-use-sms",
  "/referral-program",
  "/see-what-youre-losing",
  "/simplify-fundraising-maximize-impact",
  "/simplify-fundraising-maximize-impacts",
  "/the-smart-move-to-make-for-accepting-crypto-donations",
  "/unlock-us-donations",
] as const satisfies ReadonlyArray<Parameters<typeof href>[0]>;

export default async function handle_request(
  request: Request,
  response_status_code: number,
  response_headers: Headers,
  router_context: EntryContext,
  _load_context: AppLoadContext
) {
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status: response_status_code,
      headers: response_headers,
    });
  }

  // __vdpl cookie pins subsequent client requests (assets, data) to this
  // exact deployment, preventing version skew during rollouts. vercel's
  // edge reads the cookie and routes accordingly.
  // docs: https://vercel.com/docs/skew-protection#with-other-frameworks
  //
  // skip the cookie on public/embed routes that rely on cdn caching — any
  // `set-cookie` makes vercel's cdn bypass the cache. authenticated routes
  // still get the cookie so their client-side asset/data fetches stay
  // pinned to the serving deployment.
  if (vercel_skew_protection_enabled && vercel_deployment_id) {
    const pathname = new URL(request.url).pathname;
    const is_public = SKIP_VDPL_PATHS.some((p) => matchPath(p, pathname));
    if (!is_public) {
      const existing = await vdpl_cookie.parse(request.headers.get("cookie"));
      if (existing !== vercel_deployment_id) {
        response_headers.append(
          "set-cookie",
          await vdpl_cookie.serialize(vercel_deployment_id)
        );
      }
    }
  }

  return new Promise((resolve, reject) => {
    let shell_rendered = false;
    const user_agent = request.headers.get("user-agent");

    const ready_option: keyof RenderToPipeableStreamOptions =
      (user_agent && isbot(user_agent)) || router_context.isSpaMode
        ? "onAllReady"
        : "onShellReady";

    let timeout_id: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => abort(),
      streamTimeout + 1000
    );

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={router_context} url={request.url} />,
      {
        [ready_option]() {
          shell_rendered = true;
          const body = new PassThrough({
            final(callback) {
              clearTimeout(timeout_id);
              timeout_id = undefined;
              callback();
            },
          });
          const stream = createReadableStreamFromReadable(body);

          response_headers.set("content-type", "text/html");

          resolve(
            new Response(stream, {
              headers: response_headers,
              status: response_status_code,
            })
          );

          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          response_status_code = 500;
          if (shell_rendered) {
            report_error(error);
          }
        },
      }
    );
  });
}

// react-router calls handleError for loader/action throws; report_error filters
// out 4xx Responses so only true app errors page sentry.
export function handleError(error: unknown, { request }: { request: Request }) {
  if (request.signal.aborted) return;
  report_error(error, { method: request.method, url: request.url });
}
