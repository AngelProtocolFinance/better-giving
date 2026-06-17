// polyfill process.env in chromium so server modules (`.server/env.ts`)
// can read top-level process.env.X when pulled in via route handlers.
// vitest injects `.env*` into import.meta.env via `loadEnv` (see vite.config.ts).
const g = globalThis as { process?: { env: Record<string, string> } };
g.process = g.process ?? { env: { ...import.meta.env } };

import { HttpResponse, http } from "msw";
import { setupWorker } from "msw/browser";
import { afterEach, beforeAll } from "vitest";
import { handlers as programsHandlers } from "#/services/aws/programs/mock";
import { handlers as apiHandlers } from "./services/api/mock";

const qstash_url = import.meta.env.QSTASH_URL;

export const mswWorker = setupWorker(
  ...programsHandlers,
  ...apiHandlers,
  http.get("https://5820hdyj.api.sanity.io/*", () =>
    HttpResponse.json({ result: [] })
  ),
  http.get("https://5820hdyj.apicdn.sanity.io/*", () =>
    HttpResponse.json({ result: [] })
  ),
  // nowpayments token logos rendered in crypto checkout
  http.get(
    "https://nowpayments.io/*",
    () => new HttpResponse(null, { status: 200 })
  ),
  // qstash — enqueue() and don_dist() fire during integration tests
  http.post(`${qstash_url}/v2/*`, async ({ request }) => {
    const body = await request.json();
    if (Array.isArray(body)) {
      // batchJSON — array of { destination, body }
      for (const item of body) {
        const id =
          item.destination?.match(/\/api\/q-(?:handler|don-dist)\/(.+)/)?.[1] ??
          "unknown";
        const payload =
          typeof item.body === "string" ? JSON.parse(item.body) : item.body;
        _qstash_requests.push({ id, payload });
      }
      return HttpResponse.json(body.map(() => ({ messageId: "test" })));
    }
    // enqueueJSON — destination is in the request URL path
    const id =
      request.url.match(/\/api\/q-(?:handler|don-dist)\/(.+)/)?.[1] ??
      "unknown";
    _qstash_requests.push({ id, payload: body });
    return HttpResponse.json({ messageId: "test" });
  })
);

// captured qstash publish bodies for test assertions
const _qstash_requests: { id: string; payload: any }[] = [];
export function get_qstash_events() {
  return _qstash_requests;
}
export function clear_qstash_events() {
  _qstash_requests.length = 0;
}

beforeAll(async () => {
  await mswWorker.start({ onUnhandledRequest: "warn", quiet: true });
});

// reset handlers after each test — important for test isolation
afterEach(() => {
  mswWorker.resetHandlers();
  clear_qstash_events();
});
