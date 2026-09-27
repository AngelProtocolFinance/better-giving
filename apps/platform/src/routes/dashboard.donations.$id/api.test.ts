import type { donation_receipt as dr } from "emails";
import { createFormData } from "remix-hook-form";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { IDonation } from "@/donations";

const user = { email: "donor@test.com" };

vi.mock("#/.server/auth", () => ({ user_ctx: {} }));
vi.mock("#/.server/toast", () => ({
  redirectWithSuccess: vi.fn(() => new Response(null, { status: 302 })),
  dataWithError: vi.fn((_d: unknown, msg: string) => ({ error: msg })),
}));
vi.mock("$/env", () => ({ app: { npo_id: "1" } }));

const send_email_or_throw = vi.hoisted(() =>
  vi.fn(async (_i: { node: any; to: string[]; subject: string }) => ({
    id: "e-1",
  }))
);
vi.mock("$/email", () => ({ send_email_or_throw }));

const report_error = vi.hoisted(() => vi.fn());
vi.mock("#/errors/report", () => ({ report_error }));

const charge = vi.hoisted(() => ({ amount_refunded: 0 }));
const retrieve_intent = vi.hoisted(() =>
  vi.fn(async (_id: string, _o?: unknown) => ({ latest_charge: charge }))
);
vi.mock("$/kit/stripe", () => ({
  stripe: { paymentIntents: { retrieve: retrieve_intent } },
}));

const store = vi.hoisted(() => ({
  don: null as unknown,
  npos: [] as {
    id: number;
    name: string;
    active: boolean;
    receipt_msg?: string;
  }[],
  dists: [] as { to_id: number; amount: number }[],
  refund_statuses: [] as ("completed" | "loss" | "failed" | null)[],
}));
vi.mock("$/pg/queries/donation", () => ({
  donation_get: async () => store.don,
}));
vi.mock("$/pg/queries/npo", () => ({
  npo_get: async (id: number) => store.npos.find((n) => n.id === id),
  npos_batch_get: async (ids: number[]) =>
    store.npos.filter((n) => ids.includes(n.id)),
}));
vi.mock("$/pg/queries/user", () => ({ user_get: async () => undefined }));
vi.mock("$/pg/queries/dist", () => ({
  dist_shares_of: async () => store.dists,
  donation_refund_started: async () =>
    store.refund_statuses.some((s) => s !== null),
}));

import { send_receipt } from "#/routes/api.q-handler.$event/handle-don-receipt/send-receipt";
import { action } from "./api";

const fund_don = (
  to_members: string[],
  o: Partial<Pick<IDonation, "status" | "amount" | "settlement">> = {}
) =>
  ({
    id: "don-1",
    status: "settled",
    to_id: "fund-1",
    to_name: "Climate Fund",
    to_type: "fund",
    to_members,
    from_email: user.email,
    via: "stripe:card",
    created_at: "2026-01-01T00:00:00.000Z",
    amount: { base: 100, tip: 0, fee_allowance: 0 },
    upusd: 1,
    currency: "USD",
    ...o,
  }) as unknown as IDonation;

const npo = (id: number, name: string, active = true) => ({
  id,
  name,
  active,
});

const long_ago = "2020-01-01T00:00:00.000Z";
const just_now = () => new Date(Date.now() - 60_000).toISOString();
const settled = (date: string) => ({
  id: "sttl-1",
  date,
  currency: "USD",
  net: 97,
  fee: 3,
});

/** the dists a split of `base` over `of` members wrote, one per id landed */
const paid = (ids: number[], base = 100, of = ids.length) =>
  ids.map((to_id) => ({ to_id, amount: base / of }));

const resend = () =>
  action({
    request: new Request("http://test/dashboard/donations/don-1", {
      method: "POST",
      body: createFormData({
        name: { first: "Ada", last: "Lovelace" },
        address: { street: "1 Main St", complement: "" },
        city: "Springfield",
        postal_code: "12345",
        country: "United States",
        email: user.email,
        us_state: "IL",
        state: "",
      }),
    }),
    params: { id: "don-1" },
    context: { get: () => user },
  } as any);

/** the one receipt mailed, as each line prints */
const printed = () => {
  expect(send_email_or_throw).toHaveBeenCalledOnce();
  const p = send_email_or_throw.mock.calls[0]![0].node.props;
  return p.lines.map((l: any) => [l.name, l.amount.value.toFixed(2)]);
};

describe("send_receipts - resending a fund gift's receipts", () => {
  beforeEach(() => {
    send_email_or_throw.mockClear();
    store.npos = [
      npo(10, "Alpha"),
      npo(11, "Beta", false),
      npo(12, "Gamma"),
      npo(13, "Delta"),
    ];
  });

  test("receipts the members settlement paid, one inactive since", async () => {
    store.don = fund_don(["10", "11", "12"]);
    // beta was paid, then went inactive
    store.dists = paid([12, 10, 11]);

    await resend();

    expect(printed()).toEqual([
      ["Alpha", "33.34"],
      ["Beta", "33.33"],
      ["Gamma", "33.33"],
    ]);
  });

  test("long after a split that wrote no dist, receipts the funded members", async () => {
    store.don = fund_don(["10", "11", "12"], { settlement: settled(long_ago) });
    store.dists = [];

    await resend();

    expect(printed()).toEqual([
      ["Alpha", "50.00"],
      ["Gamma", "50.00"],
    ]);
  });

  test("a member reactivated since the split is not on the resend", async () => {
    store.don = fund_don(["10", "12", "13"]);
    // delta was inactive when the split ran, so it was never paid
    store.dists = paid([10, 12]);

    await resend();

    expect(printed()).toEqual([
      ["Alpha", "50.00"],
      ["Gamma", "50.00"],
    ]);
  });

  test("mid-fan-out, the queue send receipts every member the split pays", async () => {
    const d = fund_don(["10", "12", "13"]);
    // the split commits one dist per member; alpha's is in, gamma's and
    // delta's are still queued
    store.dists = paid([10], 100, 3);

    await send_receipt({ ...d, to_paid: [10, 12, 13] });

    expect(printed()).toEqual([
      ["Alpha", "33.34"],
      ["Gamma", "33.33"],
      ["Delta", "33.33"],
    ]);
  });

  test.each([
    ["one of three dists in", paid([10], 100, 3)],
    ["no dist in yet", []],
  ])(
    "mid-fan-out, %s: the resend mails nothing and says why",
    async (_, dists) => {
      store.don = fund_don(["10", "12", "13"], {
        settlement: settled(just_now()),
      });
      store.dists = dists;

      const res = await resend();

      expect(send_email_or_throw).not.toHaveBeenCalled();
      expect(res).toEqual({
        error:
          "This donation is still being distributed. Please try again in a few minutes.",
      });
    }
  );

  test("a split just finished: the resend receipts every member it paid", async () => {
    store.don = fund_don(["10", "12", "13"], {
      amount: { base: 0.9, tip: 0, fee_allowance: 0 },
      settlement: settled(just_now()),
    });
    // three thirds of 0.9 sum to 0.8999999999999999, not 0.9
    store.dists = paid([10, 12, 13], 0.9);

    await resend();

    expect(printed()).toEqual([
      ["Alpha", "0.30"],
      ["Gamma", "0.30"],
      ["Delta", "0.30"],
    ]);
  });

  test("a split stuck short, long settled, receipts the members it did pay", async () => {
    store.don = fund_don(["10", "12", "13"], { settlement: settled(long_ago) });
    // gamma's and delta's dists never landed
    store.dists = paid([10], 100, 3);

    await resend();

    expect(printed()).toEqual([["Alpha", "100.00"]]);
  });
});

describe("resending a refunded gift's receipts", () => {
  beforeEach(() => {
    send_email_or_throw.mockClear();
    store.npos = [npo(10, "Alpha"), npo(12, "Gamma")];
    store.dists = paid([10, 12]);
  });

  test.each(["refunded", "refunded_loss"] as const)(
    "a %s gift mails nothing and says why",
    async (status) => {
      store.don = fund_don(["10", "12"], {
        status,
        amount: { base: 100, tip: 5, fee_allowance: 0 },
      });

      const res = await resend();

      expect(send_email_or_throw).not.toHaveBeenCalled();
      expect(res).toEqual({
        error: "This donation was refunded, so it has no tax receipt to send.",
      });
    }
  );
});

describe("resending a gift a refund has started on", () => {
  beforeEach(() => {
    send_email_or_throw.mockClear();
    store.npos = [npo(10, "Alpha"), npo(12, "Gamma")];
    store.dists = paid([10, 12]);
    store.don = fund_don(["10", "12"], {
      amount: { base: 100, tip: 5, fee_allowance: 0 },
    });
  });

  test.each([
    ["one dist returned, the other's reversal failed", ["completed", "failed"]],
    ["every dist returned, donation still settled", ["completed", "completed"]],
  ] as const)("%s: mails nothing and says why", async (_, statuses) => {
    store.refund_statuses = [...statuses];

    const res = await resend();

    expect(send_email_or_throw).not.toHaveBeenCalled();
    expect(res).toEqual({
      error:
        "This donation is being refunded, so it has no tax receipt to send.",
    });
  });

  test("no refund on any dist: one receipt with each member and the tip", async () => {
    store.refund_statuses = [null, null];

    await resend();

    expect(printed()).toEqual([
      ["Alpha", "50.00"],
      ["Gamma", "50.00"],
      ["Better Giving", "5.00"],
    ]);
  });
});

describe("resending a stripe gift", () => {
  beforeEach(() => {
    send_email_or_throw.mockClear();
    retrieve_intent.mockClear();
    report_error.mockClear();
    store.refund_statuses = [];
    store.dists = [];
    store.npos = [npo(10, "Alpha")];
    store.don = {
      ...fund_don(["10"]),
      settlement: {
        id: "pi_1",
        date: "2026-01-01",
        currency: "USD",
        net: 97,
        fee: 3,
      },
    } as IDonation;
  });

  test("a partly refunded charge mails nothing and says why", async () => {
    // a partial refund only alerts finance: nothing on the donation or its
    // dists says the full amount no longer stands
    charge.amount_refunded = 2500;

    const res = await resend();

    expect(retrieve_intent).toHaveBeenCalledWith("pi_1", {
      expand: ["latest_charge"],
    });
    expect(send_email_or_throw).not.toHaveBeenCalled();
    expect(res).toEqual({
      error:
        "This donation was partly refunded, so we can't resend its original receipt. Contact support for an updated one.",
    });
  });

  test("a charge stripe won't return mails nothing, and is reported", async () => {
    const outage = new Error("stripe unavailable");
    retrieve_intent.mockRejectedValueOnce(outage);

    const res = await resend();

    expect(send_email_or_throw).not.toHaveBeenCalled();
    expect(res).toEqual({
      error:
        "We couldn't check this donation's refund status. Please try again.",
    });
    expect(report_error).toHaveBeenCalledWith(outage, expect.anything());
  });

  test("an unrefunded charge gets its receipt", async () => {
    charge.amount_refunded = 0;

    await resend();

    expect(printed()).toEqual([["Alpha", "100.00"]]);
  });
});

describe("a resend that fails", () => {
  beforeEach(() => {
    send_email_or_throw.mockClear();
    report_error.mockClear();
    store.refund_statuses = [];
    store.dists = [];
    store.npos = [npo(10, "Alpha")];
    store.don = fund_don(["10"]);
  });

  test("a mail the provider refused says so instead of 'Receipt sent'", async () => {
    const refused = new Error("550");
    send_email_or_throw.mockRejectedValueOnce(refused);

    const res = await resend();

    expect(res).toEqual({
      error: "We couldn't send your receipt. Please try again.",
    });
    // reported here too: a render error never reaches `send_email`'s report
    expect(report_error).toHaveBeenCalledWith(refused, expect.anything());
  });

  test("a gift to a nonprofit that no longer exists is not found", async () => {
    store.don = { ...fund_don([]), to_id: "99", to_type: "npo" } as IDonation;

    const res = await resend();

    expect(send_email_or_throw).not.toHaveBeenCalled();
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(404);
  });
});

describe("the resend and the queue send", () => {
  beforeEach(() => {
    send_email_or_throw.mockClear();
    store.refund_statuses = [];
    store.dists = [];
    store.npos = [
      npo(1, "Better Giving"),
      npo(10, "Alpha"),
      npo(11, "Beta", false),
      { ...npo(12, "Gamma"), receipt_msg: "Thank you from Gamma." },
    ];
  });

  const tipped = { base: 100, tip: 5, fee_allowance: 0 };
  const npo_don = (to_id: string, to_name: string) =>
    ({
      ...fund_don([], { amount: tipped }),
      to_id,
      to_name,
      to_type: "npo",
      program: { id: "p-1", name: "School Lunches" },
    }) as IDonation;

  test.each([
    [
      // beta was paid, then went inactive
      "a tipped fund gift, one member deactivated since the split",
      fund_don(["10", "11", "12"], { amount: tipped }),
      [12, 10, 11],
      [
        ["beneficiary", "Alpha", "33.34"],
        ["beneficiary", "Beta", "33.33"],
        ["beneficiary", "Gamma", "33.33"],
        ["tip", "Better Giving", "5.00"],
      ],
    ],
    [
      // beta was inactive at the split and still is
      "a tipped fund gift after the split",
      fund_don(["10", "11", "12"], { amount: tipped }),
      [12, 10],
      [
        ["beneficiary", "Alpha", "50.00"],
        ["beneficiary", "Gamma", "50.00"],
        ["tip", "Better Giving", "5.00"],
      ],
    ],
    [
      "a tipped nonprofit gift to a program",
      npo_don("12", "Gamma"),
      [],
      [
        ["beneficiary", "Gamma", "100.00"],
        ["tip", "Better Giving", "5.00"],
      ],
    ],
    [
      "a tipped gift to better giving itself",
      npo_don("1", "Better Giving"),
      [],
      [
        ["beneficiary", "Better Giving", "100.00"],
        ["tip", "Better Giving", "5.00"],
      ],
    ],
  ])("%s gets the same receipt either way", async (_, d, paid_ids, lines) => {
    store.don = d;
    store.dists = paid(paid_ids);

    await resend();
    await send_receipt(d.to_type === "fund" ? { ...d, to_paid: paid_ids } : d);

    expect(send_email_or_throw).toHaveBeenCalledTimes(2);
    const [resent, queued] = send_email_or_throw.mock.calls.map(
      ([i]) => i.node.props as dr.IData
    );
    for (const r of [resent!, queued!]) {
      expect(
        r.lines.map((l) => [l.kind, l.name, l.amount.value.toFixed(2)])
      ).toEqual(lines);
      expect(r.amount.value).toBe(105);
    }
    // the donor the resend prints comes from its form, not the donation
    const { from: _r, ...resent_rest } = resent!;
    const { from: _q, ...queued_rest } = queued!;
    expect(resent_rest).toEqual(queued_rest);
  });
});
