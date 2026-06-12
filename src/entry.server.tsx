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
import { PassThrough, Transform } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import * as Sentry from "@sentry/react-router";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";
import {
  type AppLoadContext,
  type EntryContext,
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
// VERCEL_DEPLOYMENT_ID is auto-injected by vercel on every deploy. we don't gate
// on VERCEL_SKEW_PROTECTION_ENABLED because the edge always honors ?dpl= when
// present — the env flag only governs framework-default behavior, not routing.
// docs: https://vercel.com/docs/skew-protection
const vercel_deployment_id = process.env.VERCEL_DEPLOYMENT_ID;

// matches asset urls like /assets/foo-abc123.js (no query already attached).
// the negative lookahead prevents re-rewriting and guards against matching
// inside an already-querified url. extension set covers js/css/fonts/images
// /sourcemaps/wasm — everything vite emits under /assets/.
const ASSET_URL_RE =
  /\/assets\/[A-Za-z0-9._\-/]+\.(?:js|mjs|css|map|woff2?|ttf|otf|svg|png|jpe?g|webp|gif|ico|wasm)(?![A-Za-z0-9._\-/?])/g;

// rewrites every /assets/* reference in the ssr html stream to carry
// ?dpl=<deployment-id>. browser tag-loads (script/link/preload/img) then
// carry the deployment id on the request url, so vercel's edge pins the
// asset request to the deployment that served the html. lets us drop the
// __vdpl set-cookie (which was killing cdn caching on document responses)
// without reintroducing /assets/* 404s after a rollout.
// upstream tracking for a built-in fix: vercel/vercel#16604.
function make_asset_pin_transform(deployment_id: string): Transform {
  const TAIL = 256;
  let tail = "";
  return new Transform({
    transform(chunk, _enc, cb) {
      const combined = tail + chunk.toString("utf8");
      // hold back the last TAIL chars so a url straddling the next chunk
      // boundary isn't mis-rewritten. flush emits whatever remains.
      const split = combined.length > TAIL ? combined.length - TAIL : 0;
      const emit = combined
        .slice(0, split)
        .replace(ASSET_URL_RE, `$&?dpl=${deployment_id}`);
      tail = combined.slice(split);
      cb(null, Buffer.from(emit, "utf8"));
    },
    flush(cb) {
      const emit = tail.replace(ASSET_URL_RE, `$&?dpl=${deployment_id}`);
      tail = "";
      cb(null, Buffer.from(emit, "utf8"));
    },
  });
}

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

  // skew-protection strategy: rewrite asset urls in the response html to
  // include ?dpl=<deployment-id>. browsers then carry it on tag-load
  // requests (script/link/preload/img) and vercel's edge pins those to the
  // correct deployment. no set-cookie, so document responses remain
  // cdn-cacheable. docs: https://vercel.com/docs/skew-protection#supported-frameworks
  const asset_pin = vercel_deployment_id
    ? make_asset_pin_transform(vercel_deployment_id)
    : null;

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

          if (asset_pin) {
            pipe(asset_pin).pipe(body);
          } else {
            pipe(body);
          }
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
