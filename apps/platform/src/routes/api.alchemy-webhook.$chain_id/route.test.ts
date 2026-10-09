import path from "node:path";
import type { RouteConfigEntry } from "@react-router/dev/routes";
import {
  createStaticHandler,
  matchRoutes,
  type RouteObject,
} from "react-router";
import { describe, expect, test, vi } from "vitest";

vi.mock("$/env", async (original) => ({
  ...(await original<typeof import("$/env")>()),
  alchemy_signing_key: { "eth-mainnet": "whsec_eth_env" },
}));

// the real route config, so the fs-routes nesting under test is the app's own
const app_dir = path.resolve(import.meta.dirname, "../..");
Object.assign(globalThis, { __reactRouterAppDirectory: app_dir });
const { default: config } = await import("#/routes");

const is_alchemy = (e: RouteConfigEntry): boolean =>
  e.file.includes("alchemy-webhook") || !!e.children?.some(is_alchemy);

const to_route = async (e: RouteConfigEntry): Promise<RouteObject> => {
  const mod = e.file.includes("alchemy-webhook")
    ? await import(/* @vite-ignore */ path.join(app_dir, e.file))
    : {};
  const children = await Promise.all(
    (e.children ?? []).filter(is_alchemy).map(to_route)
  );
  return { id: e.id, path: e.path, action: mod.action, children };
};

const routes: RouteObject[] = [
  {
    id: "root",
    path: "",
    children: await Promise.all(
      (await config).filter(is_alchemy).map(to_route)
    ),
  },
];

const KEYLESS = "routes/api.alchemy-webhook.$chain_id";
const KEYED = "routes/api.alchemy-webhook.$chain_id_.$signing_key";

describe("alchemy webhook urls", () => {
  test.each([
    ["/api/alchemy-webhook/eth-mainnet", KEYLESS],
    ["/api/alchemy-webhook/eth-mainnet/anykey", KEYED],
  ])("%s is its own leaf under root", (url, id) => {
    const matched = matchRoutes(routes, url)?.map((m) => m.route.id);
    expect(matched).toEqual(["root", id]);
  });

  test.each([
    "/api/alchemy-webhook/eth-mainnet",
    "/api/alchemy-webhook/eth-mainnet/anykey",
  ])("a POST to %s reaches the webhook handler", async (url) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await createStaticHandler(routes).queryRoute(
      new Request(`https://x${url}`, { method: "POST", body: "{}" })
    );

    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(401);
    expect(await (res as Response).text()).toBe("invalid signature");
  });
});
