import { describe, expect, test, vi } from "vitest";

const npo_get = vi.hoisted(() => vi.fn());
vi.mock("$/pg/queries/npo", () => ({ npo_get }));
vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock({
    user_ctx: true,
    middleware: true,
  })
);

import { admin_ctx, user_ctx } from "#/.server/auth";
import { loader } from "./route";

const NPO_ID = 11;

const load = () =>
  loader({
    context: {
      get: (k: unknown) =>
        k === admin_ctx ? NPO_ID : k === user_ctx ? { id: "u-1" } : undefined,
    },
  } as any);

describe("npo admin layout loader", () => {
  // a returned Response reaches the route as its data, and `meta` reads
  // `endow.name` off the body text
  test("an npo that doesn't exist throws a 404 to the error boundary", async () => {
    npo_get.mockResolvedValue(undefined);

    await expect(load()).rejects.toMatchObject({ status: 404 });
  });
});
