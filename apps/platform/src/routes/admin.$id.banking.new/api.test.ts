import { beforeEach, describe, expect, it, vi } from "vitest";

// --- mocks (hoisted) ---

const q = vi.hoisted(() => ({
  bapp_put: vi.fn(),
  npo_bapp_count: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock("$/pg/db", () => ({ db: {} }));
vi.mock("$/pg/queries/banking", () => ({
  bapp_put: q.bapp_put,
  npo_bapp_count: q.npo_bapp_count,
}));
vi.mock("$/kit/queue", () => ({ enqueue: q.enqueue }));
vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock()
);
vi.mock("#/.server/toast", async () => {
  const { redirect } = await import("react-router");
  return { redirectWithSuccess: vi.fn((url: string) => redirect(url)) };
});

// --- imports (after mocks hoisted) ---

import { admin_ctx } from "#/.server/auth";
import { action } from "./api";

const OWN_NPO = 11;
const OTHER_NPO = 22;

const call = (body: object) =>
  (action as any)({
    request: new Request(`https://app.test/admin/${OWN_NPO}/banking/new`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    params: { id: String(OWN_NPO) },
    context: { get: (k: unknown) => (k === admin_ctx ? OWN_NPO : undefined) },
  });

const body = (endowmentID: number) => ({
  wiseRecipientID: "40000001",
  endowmentID,
  bankSummary: "USD account ending in 1234",
  bankStatementFile: { name: "s.pdf", publicUrl: "https://x.test/s.pdf" },
});

beforeEach(() => {
  for (const f of Object.values(q)) f.mockReset();
  q.npo_bapp_count.mockResolvedValue(0);
});

describe("new banking application", () => {
  it("files the application on the nonprofit the member administers", async () => {
    const res: Response = await call(body(OWN_NPO));

    expect(res.status).toBe(302);
    expect(q.npo_bapp_count).toHaveBeenCalledWith(OWN_NPO);
    expect(q.bapp_put).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ npo_id: OWN_NPO, status: "under-review" })
    );
    expect(q.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { npo_id: OWN_NPO } })
    );
  });

  it("refuses a body naming another nonprofit with 403 and writes nothing", async () => {
    const res: Response = await call(body(OTHER_NPO));

    expect(res.status).toBe(403);
    expect(q.bapp_put).not.toHaveBeenCalled();
    expect(q.enqueue).not.toHaveBeenCalled();
  });
});
