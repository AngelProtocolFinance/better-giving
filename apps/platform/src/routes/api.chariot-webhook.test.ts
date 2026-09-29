import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const get_grant_mock = vi.hoisted(() => vi.fn());
const donation_mocks = vi.hoisted(() => ({
  get: vi.fn(),
  locked: vi.fn(),
  update: vi.fn(),
}));
const send_alert_mock = vi.hoisted(() => vi.fn(async () => {}));
const report_error_mock = vi.hoisted(() => vi.fn());
const report_resp_mock = vi.hoisted(() =>
  vi.fn((e: any) => new Response(e?.message ?? "error", { status: 500 }))
);
const enqueue_mock = vi.hoisted(() => vi.fn());
const has_dists_mock = vi.hoisted(() => vi.fn());

vi.mock("$/env", () => ({
  chariot: { signing_key: "whsec-test" },
  stage: "test",
}));
vi.mock("$/kit/chariot", () => ({ chariot: { get_grant: get_grant_mock } }));
vi.mock("$/kit/queue", () => ({ enqueue: enqueue_mock }));
vi.mock("$/kit/discord", () => ({
  aws_monitor: { send_alert: send_alert_mock },
}));
vi.mock("$/pg/db", () => ({
  db: { transaction: (fn: (tx: unknown) => unknown) => fn({}) },
}));
vi.mock("$/pg/queries/donation", () => ({
  donation_get: donation_mocks.get,
  donation_settle_state_locked: donation_mocks.locked,
  donation_update: donation_mocks.update,
}));
vi.mock("$/pg/queries/dist", () => ({ donation_has_dists: has_dists_mock }));
vi.mock("#/errors/report", () => ({
  report_error: report_error_mock,
  report_resp: report_resp_mock,
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
  donation_mocks.locked.mockReset();
  donation_mocks.update.mockReset();
  send_alert_mock.mockReset();
  report_error_mock.mockReset();
  report_resp_mock.mockClear();
  enqueue_mock.mockReset();
  has_dists_mock.mockReset();
});

const quiet_console = () =>
  (["log", "info", "warn", "error"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {})
  );

const alert_body = () =>
  (send_alert_mock.mock.calls as unknown as [{ body: string }][])[0]![0].body;

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
      donation_mocks.locked.mockResolvedValue({ status: "intent" });
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

describe("chariot webhook grant without our metadata", () => {
  it.each([
    ["no metadata", undefined],
    ["metadata without a donation id", { campaign: "x" }],
  ])(
    "acks a grant with %s and reports it, without looking up a donation",
    async (_, metadata) => {
      quiet_console();
      get_grant_mock.mockResolvedValue({
        id: "grant-30",
        status: "Completed",
        amount: 10_000,
        metadata,
      });

      const res = await deliver({
        id: "ev-30",
        category: "grant.updated",
        associated_object_type: "grant",
        associated_object_id: "grant-30",
      });

      expect(res.status).toBe(200);
      expect(donation_mocks.get).not.toHaveBeenCalled();
      expect(report_error_mock).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ grant_id: "grant-30" })
      );
    }
  );
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
    ["only a non-v1 scheme", `t=${T},v0=${sign(body)}`],
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
  ])("rejects %s with a 401, warning without the body", async (_, v1) => {
    const [, , warn] = quiet_console();
    const res = await post(body, `t=${T},v1=${v1}`);

    expect(res.status).toBe(401);
    expect(get_grant_mock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    const line = warn!.mock.calls.flat().join(" ");
    expect(line).toContain(T);
    expect(line).toContain("1 v1");
    expect(line).not.toContain("ev-4");
    expect(line).not.toContain(v1);
  });

  const other = `v1=${sign(body, "whsec-other")}`;
  const valid = `v1=${sign(body)}`;
  it.each([
    ["first", `${valid},${other}`],
    ["last", `${other},${valid}`],
  ])("accepts when the matching v1 comes %s", async (_, sigs) => {
    quiet_console();
    get_grant_mock.mockResolvedValue({
      id: "grant-4",
      status: "Initiated",
      metadata: { don_id: "don-4" },
    });

    const res = await post(body, `t=${T},${sigs}`);

    expect(get_grant_mock).toHaveBeenCalledWith("grant-4");
    expect(res.status).toBe(203);
  });
});

describe("chariot webhook canceled grant", () => {
  const cancel_event = {
    id: "ev-5",
    category: "grant.updated",
    associated_object_type: "grant",
    associated_object_id: "grant-5",
  };
  const canceled_grant = (don_id: string) => ({
    id: "grant-5",
    status: "Canceled",
    amount: 10_000,
    metadata: { don_id },
  });

  it.each(["created", "intent", "confirmed"])(
    "cancels a %s donation",
    async (status) => {
      quiet_console();
      get_grant_mock.mockResolvedValue(canceled_grant("don-5"));
      donation_mocks.get.mockResolvedValue({ id: "don-5", status });
      donation_mocks.locked.mockResolvedValue({ status });
      donation_mocks.update.mockResolvedValue({ id: "don-5" });

      const res = await deliver(cancel_event);

      expect(res.status).toBe(202);
      expect(donation_mocks.update).toHaveBeenCalledExactlyOnceWith(
        expect.anything(),
        "don-5",
        { status: "cancelled" }
      );
    }
  );

  it.each(["settled", "refunded", "refunded_loss"])(
    "leaves a %s donation unchanged and alerts for manual handling",
    async (status) => {
      quiet_console();
      get_grant_mock.mockResolvedValue(canceled_grant("don-6"));
      donation_mocks.get.mockResolvedValue({ id: "don-6", status });
      donation_mocks.locked.mockResolvedValue({ status });

      const res = await deliver(cancel_event);

      expect(res.status).toBeLessThan(300);
      expect(donation_mocks.update).not.toHaveBeenCalled();
      expect(send_alert_mock).toHaveBeenCalledOnce();
      const alert = JSON.stringify(send_alert_mock.mock.calls[0]);
      for (const id of ["don-6", "grant-5", status])
        expect(alert).toContain(id);
      expect(report_error_mock).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ don_id: "don-6", grant_id: "grant-5" })
      );
    }
  );

  it.each(["cancelled", "expired", "failed"])(
    "acks a %s donation without writing or alerting",
    async (status) => {
      quiet_console();
      get_grant_mock.mockResolvedValue(canceled_grant("don-7"));
      donation_mocks.get.mockResolvedValue({ id: "don-7", status });
      donation_mocks.locked.mockResolvedValue({ status });

      const res = await deliver(cancel_event);

      expect(res.status).toBeLessThan(300);
      expect(donation_mocks.update).not.toHaveBeenCalled();
      expect(send_alert_mock).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["settled", "refund tooling"],
    ["refunded", "platform loss"],
    ["refunded_loss", "platform loss"],
  ])(
    "alert for a %s donation carries amount, recipient and settlement, and says to use the %s",
    async (status, todo) => {
      quiet_console();
      get_grant_mock.mockResolvedValue({
        ...canceled_grant("don-9"),
        ...donor,
      });
      donation_mocks.get.mockResolvedValue({
        id: "don-9",
        status,
        to_id: "42",
        to_name: "River Trust",
        donor_email: donor.email,
      });
      donation_mocks.locked.mockResolvedValue({ status, sttl_id: "grant-5" });

      await deliver(cancel_event);

      const body = alert_body();
      for (const fact of [
        "100.00 USD",
        "River Trust (42)",
        "grant grant-5",
        "settlement grant-5",
        todo,
      ])
        expect(body).toContain(fact);
      for (const p of pii) expect(body).not.toContain(p);
    }
  );

  it("alerts instead of cancelling when the donation settled after it was first read", async () => {
    quiet_console();
    get_grant_mock.mockResolvedValue(canceled_grant("don-8"));
    donation_mocks.get.mockResolvedValue({ id: "don-8", status: "intent" });
    donation_mocks.locked.mockResolvedValue({ status: "settled" });

    const res = await deliver(cancel_event);

    expect(res.status).toBe(200);
    expect(donation_mocks.update).not.toHaveBeenCalled();
    expect(send_alert_mock).toHaveBeenCalledOnce();
  });

  it("still acks a settled donation when the discord alert fails", async () => {
    quiet_console();
    get_grant_mock.mockResolvedValue(canceled_grant("don-10"));
    donation_mocks.get.mockResolvedValue({ id: "don-10", status: "settled" });
    donation_mocks.locked.mockResolvedValue({ status: "settled" });
    const discord_down = new Error("discord 429");
    send_alert_mock.mockRejectedValue(discord_down);

    const res = await deliver(cancel_event);

    expect(res.status).toBe(200);
    expect(donation_mocks.update).not.toHaveBeenCalled();
    expect(report_error_mock).toHaveBeenCalledWith(
      discord_down,
      expect.anything()
    );
  });

  it("cancels the row it read when the grant carries a legacy id", async () => {
    quiet_console();
    get_grant_mock.mockResolvedValue(canceled_grant("legacy-11"));
    donation_mocks.get.mockResolvedValue({ id: "don-11", status: "intent" });
    donation_mocks.locked.mockResolvedValue({ status: "intent" });

    const res = await deliver(cancel_event);

    expect(res.status).toBe(202);
    expect(donation_mocks.locked).toHaveBeenCalledWith(
      expect.anything(),
      "don-11"
    );
    expect(donation_mocks.update).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      "don-11",
      { status: "cancelled" }
    );
  });

  it("fails a delivery whose donation does not exist, so chariot redelivers", async () => {
    quiet_console();
    get_grant_mock.mockResolvedValue(canceled_grant("don-12"));
    donation_mocks.get.mockResolvedValue(undefined);

    const res = await deliver(cancel_event);

    expect(res.status).toBe(500);
    expect(donation_mocks.update).not.toHaveBeenCalled();
    expect(send_alert_mock).not.toHaveBeenCalled();
  });
});

describe("chariot webhook completed grant", () => {
  const complete_event = {
    id: "ev-20",
    category: "grant.updated",
    associated_object_type: "grant",
    associated_object_id: "grant-20",
  };
  const completed_grant = {
    id: "grant-20",
    status: "Completed",
    amount: 10_000,
    feeDetail: { total: 300 },
    metadata: { don_id: "don-20" },
  };

  it("settles an intent donation and enqueues its messages", async () => {
    quiet_console();
    get_grant_mock.mockResolvedValue(completed_grant);
    donation_mocks.get.mockResolvedValue({ id: "don-20", status: "intent" });
    donation_mocks.locked.mockResolvedValue({ status: "intent" });

    const res = await deliver(complete_event);

    expect(res.status).toBe(200);
    expect(donation_mocks.update).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      "don-20",
      expect.objectContaining({
        status: "settled",
        settlement: expect.objectContaining({
          id: "grant-20",
          net: 97,
          fee: 3,
        }),
      })
    );
    expect(enqueue_mock.mock.calls.flat().map((m) => m.id)).toEqual([
      "don-sttl-dist",
      "don-sttl-receipt",
    ]);
  });

  it("leaves a cancelled donation unsettled and alerts", async () => {
    quiet_console();
    get_grant_mock.mockResolvedValue(completed_grant);
    donation_mocks.get.mockResolvedValue({
      id: "don-20",
      status: "intent",
      to_id: "42",
      to_name: "River Trust",
    });
    donation_mocks.locked.mockResolvedValue({ status: "cancelled" });

    const res = await deliver(complete_event);

    expect(res.status).toBe(200);
    expect(donation_mocks.update).not.toHaveBeenCalled();
    expect(enqueue_mock).not.toHaveBeenCalled();
    expect(send_alert_mock).toHaveBeenCalledOnce();
    expect(report_error_mock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ don_id: "don-20", grant_id: "grant-20" })
    );
  });

  const settled_row = {
    id: "don-20",
    status: "settled",
    to_id: "42",
    to_name: "River Trust",
    settlement: {
      id: "grant-20",
      date: T,
      net: 97,
      fee: 3,
      currency: "USD",
    },
  };

  it.each([
    [true, ["don-sttl-receipt"]],
    [false, ["don-sttl-dist", "don-sttl-receipt"]],
  ])(
    "redelivery on a settled donation re-sends its messages without settling again (distributed: %s)",
    async (distributed, sent) => {
      quiet_console();
      get_grant_mock.mockResolvedValue(completed_grant);
      donation_mocks.get.mockResolvedValue(settled_row);
      donation_mocks.locked.mockResolvedValue({
        status: "settled",
        sttl_id: "grant-20",
      });
      has_dists_mock.mockResolvedValue(distributed);

      const res = await deliver(complete_event);

      expect(res.status).toBe(200);
      expect(donation_mocks.update).not.toHaveBeenCalled();
      expect(enqueue_mock.mock.calls.flat().map((m) => m.id)).toEqual(sent);
    }
  );

  it("does not settle again when a concurrent delivery settled it after the first read", async () => {
    quiet_console();
    get_grant_mock.mockResolvedValue(completed_grant);
    donation_mocks.get.mockResolvedValue({
      ...settled_row,
      status: "intent",
      settlement: undefined,
    });
    donation_mocks.locked.mockResolvedValue({
      status: "settled",
      sttl_id: "grant-20",
    });

    const res = await deliver(complete_event);

    expect(res.status).toBe(200);
    expect(donation_mocks.update).not.toHaveBeenCalled();
    expect(enqueue_mock).not.toHaveBeenCalled();
  });

  it.each(["refunded", "refunded_loss"])(
    "redelivery on a %s donation neither settles nor re-sends anything",
    async (status) => {
      quiet_console();
      get_grant_mock.mockResolvedValue(completed_grant);
      donation_mocks.get.mockResolvedValue({ ...settled_row, status });
      donation_mocks.locked.mockResolvedValue({ status, sttl_id: "grant-20" });
      has_dists_mock.mockResolvedValue(false);

      const res = await deliver(complete_event);

      expect(res.status).toBe(200);
      expect(donation_mocks.update).not.toHaveBeenCalled();
      expect(enqueue_mock).not.toHaveBeenCalled();
      expect(send_alert_mock).not.toHaveBeenCalled();
    }
  );

  it("reports a completed grant whose donation does not exist, and fails it so chariot redelivers", async () => {
    quiet_console();
    get_grant_mock.mockResolvedValue(completed_grant);
    donation_mocks.get.mockResolvedValue(undefined);

    const res = await deliver(complete_event);

    expect(res.status).toBe(500);
    expect(report_resp_mock).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("don-20") }),
      expect.anything()
    );
    expect(donation_mocks.update).not.toHaveBeenCalled();
  });

  it("alert for a cancelled donation carries the amount and recipient, no donor data", async () => {
    quiet_console();
    get_grant_mock.mockResolvedValue({ ...completed_grant, ...donor });
    donation_mocks.get.mockResolvedValue({
      id: "don-20",
      status: "cancelled",
      to_id: "42",
      to_name: "River Trust",
      donor_email: donor.email,
    });
    donation_mocks.locked.mockResolvedValue({ status: "cancelled" });

    await deliver(complete_event);

    const body = alert_body();
    for (const fact of ["100.00 USD", "River Trust (42)", "grant-20"])
      expect(body).toContain(fact);
    for (const p of pii) expect(body).not.toContain(p);
  });
});
