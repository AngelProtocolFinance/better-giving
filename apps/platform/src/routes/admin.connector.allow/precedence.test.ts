import path from "node:path";
import type { RouteConfigEntry } from "@react-router/dev/routes";
import { matchRoutes, type RouteObject } from "react-router";
import { describe, expect, test } from "vitest";

// the real route config, so the static path's rank against admin/:id is the app's own
const app_dir = path.resolve(import.meta.dirname, "../..");
Object.assign(globalThis, { __reactRouterAppDirectory: app_dir });
const { default: config } = await import("#/routes");

const to_route = (e: RouteConfigEntry): RouteObject => ({
  id: e.id,
  path: e.path,
  children: e.children?.map(to_route),
});

const routes: RouteObject[] = [
  {
    id: "root",
    path: "",
    children: (await config).map(to_route),
  },
];

describe("connector allow route", () => {
  test("/admin/connector/allow matches the allow route and not admin/:id", () => {
    const matched = matchRoutes(routes, "/admin/connector/allow");
    expect(matched?.map((m) => m.route.id)).toEqual([
      "root",
      "routes/admin.connector.allow",
    ]);
    expect(matched?.some((m) => m.params.id === "connector")).toBe(false);
    expect(matched?.some((m) => m.route.id === "routes/admin.$id")).toBe(false);
  });
});
