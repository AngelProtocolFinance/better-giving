import { getDefaultIntegrations } from "@sentry/react-router";
import { expect, test } from "vitest";
import { client_integrations } from "./integrations";

// .tsx for the browser project: only its export conditions resolve
// `@sentry/react-router` to the browser sdk, whose defaults are the ones
// entry.client.tsx gets. the node build has no GlobalHandlers to remove.
test("drops GlobalHandlers from the browser defaults and keeps the rest", () => {
  const defaults = getDefaultIntegrations({}).map((i) => i.name);
  expect(defaults).toContain("GlobalHandlers");

  const kept = client_integrations(getDefaultIntegrations({})).map(
    (i) => i.name
  );
  expect(kept).not.toContain("GlobalHandlers");
  expect(kept).toEqual(defaults.filter((n) => n !== "GlobalHandlers"));
});
