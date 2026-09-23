import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const get_grant_mock = vi.hoisted(() => vi.fn());

vi.mock("$/env", () => ({ chariot: { signing_key: "whsec-test" } }));
vi.mock("$/kit/chariot", () => ({ chariot: { get_grant: get_grant_mock } }));
vi.mock("$/kit/queue", () => ({ enqueue: vi.fn() }));
vi.mock("$/pg/db", () => ({ db: {} }));
vi.mock("$/pg/queries/donation", () => ({
  donation_get: vi.fn(),
  donation_update: vi.fn(),
}));
vi.mock("#/errors/report", () => ({
  report_resp: (e: any) => new Response(e?.message ?? "error", { status: 500 }),
}));

const { action } = await import("./api.chariot-webhook");

const deliver = (ev: Record<string, unknown>) => {
  const body = JSON.stringify(ev);
  const t = "2026-09-23T00:00:00.000Z";
  const v1 = createHmac("sha256", "whsec-test")
    .update(`${t}.${body}`)
    .digest("hex");
  return action({
    request: new Request("https://x/api/chariot-webhook", {
      method: "POST",
      body,
      headers: { "chariot-webhook-signature": `t=${t},v1=${v1}` },
    }),
  } as any) as Promise<Response>;
};

afterEach(() => vi.restoreAllMocks());

describe("chariot webhook logging", () => {
  it("logs event type, grant id and status only — no donor data", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    get_grant_mock.mockResolvedValue({
      id: "grant-1",
      status: "Pending",
      amount: 10_000,
      metadata: { don_id: "don-1" },
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "555-0100",
      address: { line1: "1 Main St", city: "Town" },
    });

    const res = await deliver({
      id: "ev-1",
      category: "grant.updated",
      associated_object_type: "grant",
      associated_object_id: "grant-1",
    });

    expect(res.status).toBe(203);
    expect(info).toHaveBeenCalledWith(
      "[chariot webhook] received: grant.updated grant grant-1 status Pending"
    );
    for (const args of info.mock.calls) {
      for (const arg of args) expect(typeof arg).toBe("string");
      const line = args.join(" ");
      for (const pii of ["Ada", "Lovelace", "ada@example.com", "555-0100"])
        expect(line).not.toContain(pii);
    }
  });
});
