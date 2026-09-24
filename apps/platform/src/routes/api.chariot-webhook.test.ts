import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const get_grant_mock = vi.hoisted(() => vi.fn());
const donation_mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));

vi.mock("$/env", () => ({ chariot: { signing_key: "whsec-test" } }));
vi.mock("$/kit/chariot", () => ({ chariot: { get_grant: get_grant_mock } }));
vi.mock("$/kit/queue", () => ({ enqueue: vi.fn() }));
vi.mock("$/pg/db", () => ({
  db: { transaction: (fn: (tx: unknown) => unknown) => fn({}) },
}));
vi.mock("$/pg/queries/donation", () => ({
  donation_get: donation_mocks.get,
  donation_update: donation_mocks.update,
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

afterEach(() => {
  vi.restoreAllMocks();
  get_grant_mock.mockReset();
  donation_mocks.get.mockReset();
  donation_mocks.update.mockReset();
});

const quiet_console = () =>
  (["log", "info", "warn", "error"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {})
  );

const donor = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: "555-0100",
  address: { line1: "1 Main St", city: "Town" },
};
const pii = ["Ada", "Lovelace", "ada@example.com", "555-0100", "1 Main St"];

describe("chariot webhook logging", () => {
  it.each([
    ["Initiated", 203],
    ["Canceled", 202],
    ["Completed", 200],
  ])(
    "%s grant logs event, grant id and status — no donor data",
    async (status, code) => {
      const spies = quiet_console();
      get_grant_mock.mockResolvedValue({
        id: "grant-1",
        status,
        amount: 10_000,
        feeDetail: { total: 300 },
        metadata: { don_id: "don-1" },
        ...donor,
      });
      donation_mocks.get.mockResolvedValue({
        id: "don-1",
        status: "intent",
        donor_email: donor.email,
        donor_first_name: donor.firstName,
      });
      donation_mocks.update.mockResolvedValue({ id: "don-1" });

      const res = await deliver({
        id: "ev-1",
        category: "grant.updated",
        associated_object_type: "grant",
        associated_object_id: "grant-1",
      });

      expect(res.status).toBe(code);
      const logged = spies.flatMap((s) => s.mock.calls.flat());
      const line = logged.join(" ");
      for (const id of ["ev-1", "grant.updated", "grant-1", status])
        expect(line).toContain(id);
      for (const arg of logged) expect(typeof arg).toBe("string");
      for (const p of pii) expect(line).not.toContain(p);
    }
  );
});

describe("chariot webhook non-grant events", () => {
  it("acks a non-grant event without fetching a grant", async () => {
    const [, info] = quiet_console();
    const res = await deliver({
      id: "ev-2",
      category: "unintegrated_grant.created",
      associated_object_type: "unintegrated_grant",
      associated_object_id: "ug-1",
    });

    expect(res.status).toBeLessThan(300);
    expect(get_grant_mock).not.toHaveBeenCalled();
    const line = info!.mock.calls.flat().join(" ");
    expect(line).toContain("ev-2");
    expect(line).toContain("unintegrated_grant.created");
    expect(line).toContain("unintegrated_grant");
  });
});

describe("chariot webhook grant fetch", () => {
  it("logs the event id and category before a failed grant fetch", async () => {
    const [, info] = quiet_console();
    get_grant_mock.mockRejectedValue(new Error("Chariot API error: 404"));

    const res = await deliver({
      id: "ev-3",
      category: "grant.updated",
      associated_object_type: "grant",
      associated_object_id: "grant-9",
    });

    expect(res.status).toBe(500);
    const line = info!.mock.calls.flat().join(" ");
    expect(line).toContain("ev-3");
    expect(line).toContain("grant.updated");
  });
});
