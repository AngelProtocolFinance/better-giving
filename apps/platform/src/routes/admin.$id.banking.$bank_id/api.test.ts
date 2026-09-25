import { beforeEach, describe, expect, it, vi } from "vitest";

// --- mocks (hoisted) ---

const q = vi.hoisted(() => ({
  bapp_get: vi.fn(),
  bapp_set_default: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock("$/pg/queries/banking", () => ({
  bapp_get: q.bapp_get,
  bapp_set_default: q.bapp_set_default,
}));
vi.mock("$/kit/queue", () => ({ enqueue: q.enqueue }));
vi.mock("$/kit/wise", () => ({ wise: { v2_account: vi.fn() } }));
vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock()
);
vi.mock("#/.server/toast", () => ({
  dataWithSuccess: vi.fn((_d: unknown, msg: string) => ({ toast: msg })),
}));

// --- imports (after mocks hoisted) ---

import { admin_ctx } from "#/.server/auth";
import { default_action } from "./api";

const OWN_NPO = 11;
const OTHER_NPO = 22;
const BANK_ID = 7;

const call = () =>
  (default_action as any)({
    request: new Request(
      `https://app.test/admin/${OWN_NPO}/banking/${BANK_ID}`,
      { method: "POST" }
    ),
    params: { id: String(OWN_NPO), bank_id: String(BANK_ID) },
    context: { get: (k: unknown) => (k === admin_ctx ? OWN_NPO : undefined) },
  });

const row = (o: { npo_id?: number; status: string }) => ({
  id: String(BANK_ID),
  npo_id: OWN_NPO,
  ...o,
});

beforeEach(() => {
  for (const f of Object.values(q)) f.mockReset();
});

describe("set default payout method", () => {
  it("promotes an approved method of the member's own nonprofit", async () => {
    q.bapp_get.mockResolvedValue(row({ status: "approved" }));

    await call();

    expect(q.bapp_set_default).toHaveBeenCalledWith(String(BANK_ID), OWN_NPO);
    expect(q.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { npo_id: OWN_NPO } })
    );
  });

  it("answers 404 for another nonprofit's method and promotes nothing", async () => {
    q.bapp_get.mockResolvedValue(
      row({ npo_id: OTHER_NPO, status: "approved" })
    );

    const res = await call();

    expect(res.status).toBe(404);
    expect(q.bapp_set_default).not.toHaveBeenCalled();
    expect(q.enqueue).not.toHaveBeenCalled();
  });

  it.each(["under-review", "rejected"])(
    "refuses a %s method and promotes nothing",
    async (status) => {
      q.bapp_get.mockResolvedValue(row({ status }));

      const res = await call();

      expect(res.status).toBe(409);
      expect(q.bapp_set_default).not.toHaveBeenCalled();
      expect(q.enqueue).not.toHaveBeenCalled();
    }
  );

  it("treats an already-default method as done without re-promoting", async () => {
    q.bapp_get.mockResolvedValue(row({ status: "default" }));

    const res = await call();

    expect(res).toEqual({ toast: expect.any(String) });
    expect(q.bapp_set_default).not.toHaveBeenCalled();
    expect(q.enqueue).not.toHaveBeenCalled();
  });
});
