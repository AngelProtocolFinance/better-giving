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
  refund_statuses: [] as ("completed" | "loss" | "failed" | null)[],
}));
vi.mock("$/pg/queries/donation", () => ({
  donation_get: async () => store.don,
}));
vi.mock("$/pg/queries/npo", () => ({
  npo_get: async (id: number) => store.npos.find((n) => n.id === id),
}));
vi.mock("$/pg/queries/user", () => ({ user_get: async () => undefined }));
vi.mock("$/pg/queries/dist", () => ({
  donation_refund_started: async () =>
    store.refund_statuses.some((s) => s !== null),
}));

import { send_receipt } from "#/routes/api.q-handler.$event/handle-don-receipt/send-receipt";
import { action, loader } from "./api";

const fund_don = (
  to_members: string[],
  o: Partial<Pick<IDonation, "status" | "amount">> = {}
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

const resend = (as = user) =>
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
    context: { get: () => as },
  } as any);

const read = (as = user) =>
  loader({ params: { id: "don-1" }, context: { get: () => as } } as any);

/** the one receipt mailed, as each line prints */
const printed = () => {
  expect(send_email_or_throw).toHaveBeenCalledOnce();
  const p = send_email_or_throw.mock.calls[0]![0].node.props;
  return p.lines.map((l: any) => [l.name, l.amount.value.toFixed(2)]);
};

describe("send_receipts - resending a fund gift's receipt", () => {
  beforeEach(() => {
    send_email_or_throw.mockClear();
  });

  test("names the fund for the whole gift, never its members", async () => {
    // nothing records which members a split meant to pay; the donor gave to
    // the fund, and that is always true
    store.don = fund_don(["10", "11", "12"], {
      amount: { base: 100, tip: 5, fee_allowance: 0 },
    });

    await resend();

    expect(printed()).toEqual([
      ["Climate Fund", "100.00"],
      ["Better Giving", "5.00"],
    ]);
  });
});

describe("resending a refunded gift's receipts", () => {
  beforeEach(() => {
    send_email_or_throw.mockClear();
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

  test("no refund on any dist: one receipt with the fund and the tip", async () => {
    store.refund_statuses = [null, null];

    await resend();

    expect(printed()).toEqual([
      ["Climate Fund", "100.00"],
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

    expect(printed()).toEqual([["Climate Fund", "100.00"]]);
  });
});

describe("a resend that fails", () => {
  beforeEach(() => {
    send_email_or_throw.mockClear();
    report_error.mockClear();
    store.refund_statuses = [];
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
      "a tipped fund gift",
      fund_don(["10", "11", "12"], { amount: tipped }),
      [
        ["beneficiary", "Climate Fund", "100.00"],
        ["tip", "Better Giving", "5.00"],
      ],
    ],
    [
      "a tipped nonprofit gift to a program",
      npo_don("12", "Gamma"),
      [
        ["beneficiary", "Gamma", "100.00"],
        ["tip", "Better Giving", "5.00"],
      ],
    ],
    [
      "a tipped gift to better giving itself",
      npo_don("1", "Better Giving"),
      [
        ["beneficiary", "Better Giving", "100.00"],
        ["tip", "Better Giving", "5.00"],
      ],
    ],
  ])("%s gets the same receipt either way", async (_, d, lines) => {
    store.don = d;

    await resend();
    await send_receipt(d);

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

describe("whose donation it is", () => {
  const stranger = { email: "someone.else@test.com" };

  beforeEach(() => {
    send_email_or_throw.mockClear();
    store.refund_statuses = [];
    charge.amount_refunded = 0;
    store.don = fund_don(["10"]);
  });

  test("another user's donation is forbidden and mails nothing", async () => {
    // the resend mails a tax receipt carrying whatever name and address the
    // form was given, so a held donation id must not be enough
    const res = await resend(stranger);

    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(403);
    expect(send_email_or_throw).not.toHaveBeenCalled();
  });

  test("another user's donation can't be read", async () => {
    const res = await read(stranger);

    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(403);
  });

  test("a differently-cased owner email still gets the receipt", async () => {
    store.don = { ...fund_don(["10"]), from_email: "Donor@Test.COM" };
    const signed_in = { email: "DONOR@test.com" };

    expect(await read(signed_in)).toEqual({
      first_name: "",
      last_name: "",
      email: signed_in.email,
    });
    await resend(signed_in);

    expect(send_email_or_throw).toHaveBeenCalledOnce();
    expect(send_email_or_throw.mock.calls[0]![0].to).toEqual([
      "Donor@Test.COM",
    ]);
  });
});
