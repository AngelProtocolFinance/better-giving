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

const T = "2026-09-23T00:00:00.000Z";
const sign = (body: string, secret = "whsec-test") =>
  createHmac("sha256", secret).update(`${T}.${body}`).digest("hex");

const post = (body: string, signature?: string) =>
  action({
    request: new Request("https://x/api/chariot-webhook", {
      method: "POST",
      body,
      headers: signature ? { "chariot-webhook-signature": signature } : {},
    }),
  } as any) as Promise<Response>;

const deliver = (ev: Record<string, unknown>) => {
  const body = JSON.stringify(ev);
  return post(body, `t=${T},v1=${sign(body)}`);
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

describe("chariot webhook signature header", () => {
  const body = JSON.stringify({
    id: "ev-4",
    category: "grant.updated",
    associated_object_type: "grant",
    associated_object_id: "grant-4",
  });

  it.each([
    ["no header", undefined],
    ["no timestamp", `v1=${sign(body)}`],
  ])("refuses %s with a 400", async (_, header) => {
    quiet_console();
    const res = await post(body, header);

    expect(res.status).toBe(400);
    expect(get_grant_mock).not.toHaveBeenCalled();
  });

  it("accepts a single valid signature", async () => {
    quiet_console();
    get_grant_mock.mockResolvedValue({
      id: "grant-4",
      status: "Initiated",
      metadata: { don_id: "don-4" },
    });

    const res = await post(body, `t=${T},v1=${sign(body)}`);

    expect(get_grant_mock).toHaveBeenCalledWith("grant-4");
    expect(res.status).toBe(203);
  });

  it.each([
    ["a wrong signature", sign(body, "whsec-other")],
    ["a wrong-length signature", sign(body).slice(0, 10)],
  ])("rejects %s without fetching the grant", async (_, v1) => {
    quiet_console();
    const res = await post(body, `t=${T},v1=${v1}`);

    expect(res.status).toBe(201);
    expect(get_grant_mock).not.toHaveBeenCalled();
  });

  it("accepts when any v1 signature matches", async () => {
    quiet_console();
    get_grant_mock.mockResolvedValue({
      id: "grant-4",
      status: "Initiated",
      metadata: { don_id: "don-4" },
    });
    const stale = sign(body, "whsec-rotated-out");

    const res = await post(body, `t=${T},v1=${stale},v1=${sign(body)}`);

    expect(get_grant_mock).toHaveBeenCalledWith("grant-4");
    expect(res.status).toBe(203);
  });
});
