import { getDefaultIntegrations } from "@sentry/react-router";
import { expect, test } from "vitest";
import { client_integrations } from "./integrations";

const first_capturers = ["GlobalHandlers", "BrowserApiErrors"];

// .tsx for the browser project: only its export conditions resolve
// `@sentry/react-router` to the browser sdk, whose defaults are the ones
// entry.client.tsx gets. the node build has neither integration to remove.
test("drops GlobalHandlers and BrowserApiErrors from the browser defaults and keeps the rest", () => {
  const defaults = getDefaultIntegrations({}).map((i) => i.name);
  expect(defaults).toEqual(expect.arrayContaining(first_capturers));

  const kept = client_integrations(getDefaultIntegrations({})).map(
    (i) => i.name
  );
  expect(kept).toEqual(defaults.filter((n) => !first_capturers.includes(n)));
});
