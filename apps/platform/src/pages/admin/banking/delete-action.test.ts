import { beforeEach, describe, expect, it, vi } from "vitest";

// --- mocks (hoisted) ---

const q = vi.hoisted(() => ({
  bapp_get: vi.fn(),
  bapp_delete: vi.fn(),
}));

vi.mock("$/pg/queries/banking", () => q);
vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock()
);
vi.mock("#/.server/toast", async () => {
  const { redirect } = await import("react-router");
  return { redirectWithSuccess: vi.fn((url: string) => redirect(url)) };
});

// --- imports (after mocks hoisted) ---

import { admin_ctx } from "#/.server/auth";
import { delete_action } from "./delete-action";

const OWN_NPO = 11;
const OTHER_NPO = 22;
const BANK_ID = 7;

const call = () =>
  (delete_action as any)({
    params: { id: String(OWN_NPO), bank_id: String(BANK_ID) },
    context: { get: (k: unknown) => (k === admin_ctx ? OWN_NPO : undefined) },
  });

beforeEach(() => {
  q.bapp_get.mockReset();
  q.bapp_delete.mockReset();
});

describe("delete payout method", () => {
  it("deletes a method of the member's own nonprofit", async () => {
    q.bapp_get.mockResolvedValue({ id: String(BANK_ID), npo_id: OWN_NPO });

    const res: Response = await call();

    expect(res.status).toBe(302);
    expect(q.bapp_delete).toHaveBeenCalledWith(String(BANK_ID));
  });

  it("answers 404 for another nonprofit's method and deletes nothing", async () => {
    q.bapp_get.mockResolvedValue({ id: String(BANK_ID), npo_id: OTHER_NPO });

    const res: Response = await call();

    expect(res.status).toBe(404);
    expect(q.bapp_delete).not.toHaveBeenCalled();
  });

  it("answers 404 for a method that does not exist", async () => {
    q.bapp_get.mockResolvedValue(undefined);

    const res: Response = await call();

    expect(res.status).toBe(404);
    expect(q.bapp_delete).not.toHaveBeenCalled();
  });
});
