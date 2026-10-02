import { expect, test, vi } from "vitest";
import { client_integrations } from "#/errors/integrations";

const init = vi.hoisted(() => vi.fn());
vi.mock("@sentry/react-router", () => ({ init }));
// the entry hydrates `document` at import; the test page has nothing to hydrate
vi.mock("react-dom/client", () => ({ hydrateRoot: vi.fn() }));

test("a production client inits sentry with the filtered integrations", async () => {
  vi.stubEnv("VITE_STAGE", "production");
  vi.stubEnv("VITE_SENTRY_DSN", "https://key@o0.ingest.sentry.io/0");

  await import("./entry.client");

  expect(init).toHaveBeenCalledOnce();
  expect(init.mock.calls[0]![0]).toMatchObject({
    integrations: client_integrations,
  });
});
