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
  ServerRouter,
} from "react-router";
import { report_error } from "@/errors/report";
import { sentry, stage } from "$/env";

// only report from prod — preview/dev noise drowns out real signal.
if (stage === "production") {
  Sentry.init({
    dsn: sentry.dsn,
    environment: stage,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}

export const streamTimeout = 5_000;

// skew protection has two layers:
//   1. content-hashed client assets are served from a deploy-independent
//      origin (vercel blob — see vite.config.ts `base` +
//      utils/upload-client-assets.ts), so cached html from a rotated-out
//      deployment never 404s on its js/css/images.
//   2. .data loader/action requests are pinned to the serving deployment via
//      the __vdpl cookie (below). vercel's edge reads it and routes the
//      request to the matching deployment within the skew retention window.
//      cookies — unlike custom headers — are sent on <link rel=prefetch>
//      requests too, so this also covers <Link prefetch> .data prefetches.
//
// tradeoffs:
//   - first response of a cold session sets the cookie, so it's not
//     cdn-cacheable. subsequent responses in the same session skip set-cookie
//     and stay cacheable.
//   - a NEW cold visitor served a previously-cached html (no set-cookie on
//     the cached response) won't receive __vdpl. their .data requests aren't
//     pinned until they get a fresh uncached html response. this gap only
//     matters in the few-second window during an active deploy.
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

  // only set when missing or stale — every set-cookie kills cdn caching of
  // the response, so re-emitting on already-pinned sessions would gut html
  // caching.
  if (vercel_skew_protection_enabled && vercel_deployment_id) {
    const existing = await vdpl_cookie.parse(request.headers.get("cookie"));
    if (existing !== vercel_deployment_id) {
      response_headers.append(
        "set-cookie",
        await vdpl_cookie.serialize(vercel_deployment_id)
      );
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
