import { getDefaultIntegrations } from "@sentry/react-router";
import { describe, expect, test } from "vitest";
import { client_integrations } from "./integrations";

// a `.tsx` name puts this on the browser project on purpose: the sdk resolves
// to its node build under the node project, whose defaults carry
// `OnUnhandledRejection` and no `GlobalHandlers` at all.
const names = (xs: { name: string }[]) => xs.map((i) => i.name);
const defaults = () => getDefaultIntegrations({});

describe("client_integrations", () => {
  // the premise the filter rests on. if sentry ever stops installing this by
  // default, this is the test that should say so rather than the filter
  // quietly becoming dead weight.
  test("sentry installs its own global handlers by default", () => {
    expect(names(defaults())).toContain("GlobalHandlers");
  });

  // the shape IS the fix: an array is concatenated onto the defaults, so an
  // `integrations: []` leaves every one of them installed.
  test("is the callback form, the only shape that can remove a default", () => {
    expect(typeof client_integrations).toBe("function");
  });

  // with these gone, the listeners in entry.client.tsx are the only sink, and
  // every unhandled rejection is classified by report.ts before it is sent.
  test("drops sentry's global handlers", () => {
    expect(names(client_integrations(defaults()))).not.toContain(
      "GlobalHandlers"
    );
  });

  test("keeps the rest of the defaults", () => {
    const kept = names(client_integrations(defaults()));
    expect(kept).toContain("Breadcrumbs");
    expect(kept).toContain("Dedupe");
    expect(kept).toContain("HttpContext");
  });
});
