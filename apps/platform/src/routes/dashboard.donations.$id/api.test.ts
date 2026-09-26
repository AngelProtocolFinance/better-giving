import { createFormData } from "remix-hook-form";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { IDonation } from "@/donations";

const user = { email: "donor@test.com" };

vi.mock("#/.server/auth", () => ({ user_ctx: {} }));
vi.mock("#/.server/toast", () => ({
  redirectWithSuccess: vi.fn(() => new Response(null, { status: 302 })),
}));
vi.mock("$/env", () => ({ app: { npo_id: "1" } }));

const send_email = vi.hoisted(() => vi.fn());
vi.mock("$/email", () => ({ send_email }));

const store = vi.hoisted(() => ({
  don: null as unknown,
  npos: [] as { id: number; name: string; active: boolean }[],
  dist_ids: [] as number[],
}));
vi.mock("$/pg/queries/donation", () => ({
  donation_get: async () => store.don,
}));
vi.mock("$/pg/queries/npo", () => ({
  npo_get: async () => undefined,
  npos_batch_get: async (ids: number[]) =>
    store.npos.filter((n) => ids.includes(n.id)),
}));
vi.mock("$/pg/queries/user", () => ({ user_get: async () => undefined }));
vi.mock("$/pg/queries/dist", () => ({
  dist_npo_ids_of: async () => store.dist_ids,
}));

import { action } from "./api";

const fund_don = (to_members: string[]) =>
  ({
    id: "don-1",
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

/** what each receipt prints, in the order they were mailed */
const printed = () =>
  send_email.mock.calls.map(([i]) => {
    const p = (i as any).node.props;
    return [p.to_name, p.amount.value.toFixed(2)];
  });

describe("send_receipts - resending a fund gift's receipts", () => {
  beforeEach(() => {
    send_email.mockClear();
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
