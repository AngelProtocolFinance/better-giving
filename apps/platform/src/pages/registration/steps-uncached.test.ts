import { describe, expect, test } from "vitest";

// `step_loader` decides which step an applicant may be on and redirects the
// rest. a stale-first client cache renders the step anyway and follows the
// background loader's redirect with a navigate nobody awaits, so these routes
// read from `loaderData` alone.
const steps = {
  1: () => import("#/routes/_app.register.$reg_id._steps.1/route"),
  2: () => import("#/routes/_app.register.$reg_id._steps.2/route"),
  3: () => import("#/routes/_app.register.$reg_id._steps.3/route"),
  4: () => import("#/routes/_app.register.$reg_id._steps.4/route"),
  5: () => import("#/routes/_app.register.$reg_id._steps.5/route"),
};

describe("registration step routes", () => {
  test.each(Object.entries(steps))(
    "step %s has no client loader",
    async (_, load) => {
      const mod: Record<string, unknown> = await load();
      expect(mod.clientLoader).toBeUndefined();
      expect(mod.loader).toBeTypeOf("function");
    }
  );
});
