// the browser suite renders real components, so every assertion about geometry
// (a touch target, a truncating label, a gap) needs the style layer compiled and
// applied — without this the tailwind classes are inert and the tests silently
// measure unstyled boxes. packages/ui's test-setup.ts carries the same import.
import "#/index.css";
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
    HttpResponse.json({ result: { items: [], total: 0 } })
  ),
  http.get("https://5820hdyj.apicdn.sanity.io/*", () =>
    HttpResponse.json({ result: { items: [], total: 0 } })
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
afterEach(async () => {
  mswWorker.resetHandlers();
  clear_qstash_events();
  // ask's store is module state and outlives the rendered tree, so a test that
  // raises a dialog without answering it leaks that dialog into the next one.
  //
  // imported here rather than at the top: a static import of the barrel from a
  // setup file lands before a test file's own `vi.mock("@better-giving/ui")`
  // and defeats it (registration.test.tsx's FileDropzone stub stops applying).
  // a file that replaces the barrel outright has no `_reset_asks` to call, and
  // no ask store of its own to leak either.
  const ui = await import("@better-giving/ui");
  ui._reset_asks?.();
});
