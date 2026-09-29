import { getDefaultIntegrations } from "@sentry/react-router";
import { describe, expect, test } from "vitest";
import { client_integrations } from "./integrations";

// a `.tsx` name puts this on the browser project on purpose: the sdk resolves
// to its node build under the node project, whose defaults carry
// `OnUnhandledRejection` and neither of the two dropped here.
const names = (xs: { name: string }[]) => xs.map((i) => i.name);
const defaults = () => getDefaultIntegrations({});
const kept = () => names(client_integrations(defaults()));

describe("client_integrations", () => {
  // the premise the filter rests on. if sentry ever stops installing these by
  // default, this is the test that should say so rather than the filter
  // quietly becoming dead weight.
  test.each(["GlobalHandlers", "BrowserApiErrors"])(
    "sentry installs %s by default",
    (name) => {
      expect(names(defaults())).toContain(name);
    }
  );

  // the shape IS the fix: an array is concatenated onto the defaults, so an
  // `integrations: []` leaves every one of them installed.
  test("is the callback form, the only shape that can remove a default", () => {
    expect(typeof client_integrations).toBe("function");
  });

  // with both gone, the listeners in entry.client.tsx are the only sink, and
  // everything is classified by report.ts before it is sent.
  test.each(["GlobalHandlers", "BrowserApiErrors"])(
    "drops %s, which would otherwise capture before report.ts sees it",
    (name) => {
      expect(kept()).not.toContain(name);
    }
  );

  test("keeps the rest of the defaults", () => {
    expect(kept()).toContain("Breadcrumbs");
    expect(kept()).toContain("Dedupe");
    expect(kept()).toContain("HttpContext");
    expect(kept()).toContain("InboundFilters");
  });
});
