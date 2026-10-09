import { describe, expect, test, vi } from "vitest";

const user = { id: "u-1", email: "donor@test.com" };

vi.mock("#/.server/auth", () => ({ user_ctx: {} }));
vi.mock("#/.server/toast", () => ({ dataWithSuccess: vi.fn() }));
vi.mock("#/.server/user", () => ({ user_npos: vi.fn() }));
const transaction = vi.hoisted(() => vi.fn());
vi.mock("$/pg/db", () => ({ db: { transaction } }));
vi.mock("$/pg/queries/user", () => ({ userxnpo_update: vi.fn() }));

import { action } from "./api";

const context = { get: () => user };

describe("dashboard.settings action", () => {
  test("answers a body that isn't json with 400 and writes nothing", async () => {
    const request = new Request("https://x/dashboard/settings", {
      method: "POST",
      body: "not json",
      headers: { "content-type": "application/json" },
    });
    const res = await Promise.resolve(
      action({ request, context } as any)
    ).catch((e: unknown) => e);

    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });
});
