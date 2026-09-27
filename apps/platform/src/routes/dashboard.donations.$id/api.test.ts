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
  dist_ids: [] as number[],
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
  dist_npo_ids_of: async () => store.dist_ids,
  donation_refund_started: async () =>
    store.refund_statuses.some((s) => s !== null),
}));

import { send_receipt } from "#/routes/api.q-handler.$event/handle-don-receipt/send-receipt";
import { action } from "./api";

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
    store.don = fund_don(["10", "11", "12", "13"]);
    // delta joined after the split: active now, never paid
    store.dist_ids = [12, 10, 11];

    await resend();

    expect(printed()).toEqual([
      ["Alpha", "33.34"],
      ["Beta", "33.33"],
      ["Gamma", "33.33"],
    ]);
  });

  test("before the split, receipts the funded members", async () => {
    store.don = fund_don(["10", "11", "12"]);
    store.dist_ids = [];

    await resend();

    expect(printed()).toEqual([
      ["Alpha", "50.00"],
      ["Gamma", "50.00"],
    ]);
  });
});

describe("resending a refunded gift's receipts", () => {
  beforeEach(() => {
    send_email_or_throw.mockClear();
    store.npos = [npo(10, "Alpha"), npo(12, "Gamma")];
    store.dist_ids = [10, 12];
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
    store.dist_ids = [10, 12];
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
    store.refund_statuses = [];
    store.dist_ids = [];
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
        "This gift was partly refunded, so we can't resend its original receipt. Contact support for an updated one.",
    });
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
    store.refund_statuses = [];
    store.dist_ids = [];
    store.npos = [npo(10, "Alpha")];
    store.don = fund_don(["10"]);
  });

  test("a mail the provider refused says so instead of 'Receipt sent'", async () => {
    send_email_or_throw.mockRejectedValueOnce(new Error("550"));

    const res = await resend();

    expect(res).toEqual({
      error: "We couldn't send your receipt. Please try again.",
    });
  });

  test("a gift to a nonprofit that no longer exists is not found", async () => {
    store.don = { ...fund_don([]), to_id: "99", to_type: "npo" } as IDonation;

    const res = await resend();

    expect(send_email_or_throw).not.toHaveBeenCalled();
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(404);
  });
});

describe("the resend and the queue send agree", () => {
  beforeEach(() => {
    send_email_or_throw.mockClear();
    store.refund_statuses = [];
    store.dist_ids = [];
    store.npos = [
      npo(1, "Better Giving"),
      npo(10, "Alpha"),
      npo(11, "Beta", false),
      { ...npo(12, "Gamma"), receipt_msg: "Thank you from Gamma." },
      npo(13, "Delta"),
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
      "a tipped fund gift before the split",
      fund_don(["10", "11", "12"], { amount: tipped }),
      [],
    ],
    [
      // beta paid then went inactive, delta joined after: funded now is not
      // who was paid
      "a tipped fund gift after the split",
      fund_don(["10", "11", "12", "13"], { amount: tipped }),
      [12, 10, 11],
    ],
    ["a tipped nonprofit gift to a program", npo_don("12", "Gamma"), []],
    [
      "a tipped gift to better giving itself",
      npo_don("1", "Better Giving"),
      [],
    ],
  ])("%s gets the same receipt either way", async (_, d, dist_ids) => {
    store.don = d;
    store.dist_ids = dist_ids;

    await resend();
    await send_receipt(d);

    // the donor the resend prints comes from its form, not the donation
    expect(send_email_or_throw).toHaveBeenCalledTimes(2);
    const [resent, queued] = send_email_or_throw.mock.calls.map((c) => {
      const { from: _from, ...rest } = c[0].node.props;
      return rest;
    });
    expect(resent).toEqual(queued);
  });
});
