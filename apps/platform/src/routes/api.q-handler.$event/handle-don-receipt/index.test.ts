import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { IDonation } from "@/donations";
import {
  donation_donors,
  donation_recipients,
  donations,
} from "$/pg/schema/donation";
import { npos } from "$/pg/schema/npo";
import type { TestDb } from "$/pg/test-utils/pglite-browser";

// --- mocks (hoisted) ---

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

vi.mock("$/pg/db", () => ({
  db: new Proxy(
    {},
    {
      get(_, prop) {
        const real = test_db.current?.db;
        if (!real) throw new Error("test_db not initialized");
        return (real as any)[prop];
      },
    }
  ),
}));

// the only faked seam: whether a second delivery mails the donor again is the
// whole question, and the claim it turns on is a real db gate.
const send_email = vi.hoisted(() =>
  vi.fn(async (_i: { node: any; to: string[]; subject: string }) => ({
    data: { id: "email-1", response: "250 ok" },
    error: null,
  }))
);
vi.mock("$/email", () => ({ send_email, sender: "test@test.com" }));

// giving the lease back is a second db write on the way out of a failure, and
// it can fail too. everything else in the module stays real — the claim this
// suite turns on is a live UPDATE.
const fail_release = vi.hoisted(() => ({ current: false }));
// the write that records the mails as away is the one standing between the
// donor and a second tax receipt, so how many times it fails is the variable
// this suite turns on.
const fail_stamp = vi.hoisted(() => ({ times: 0 }));
vi.mock("$/pg/queries/donation", async (orig) => {
  const real = await orig<typeof import("$/pg/queries/donation")>();
  return {
    ...real,
    release_receipt_send: (
      ...args: Parameters<typeof real.release_receipt_send>
    ) => {
      if (!fail_release.current) return real.release_receipt_send(...args);
      return Promise.reject(new Error("pg unavailable"));
    },
    mark_receipt_sent: (...args: Parameters<typeof real.mark_receipt_sent>) => {
      if (fail_stamp.times <= 0) return real.mark_receipt_sent(...args);
      fail_stamp.times--;
      return Promise.reject(new Error("pg unavailable"));
    },
  };
});

const report_error = vi.hoisted(() => vi.fn());
vi.mock("@/errors/report", () => ({ report_error }));

// --- imports (after mocks) ---

import { RECEIPT_LEASE_MS } from "$/pg/queries/donation";
import { create_test_db } from "$/pg/test-utils/pglite-browser";
import { handle_don_receipt } from ".";

// --- setup ---

const DON_ID = "don-receipt-1";
let npo_id: number;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  fail_release.current = false;
  fail_stamp.times = 0;
  const db = test_db.current!.db;
  await db.delete(donation_donors);
  await db.delete(donation_recipients);
  await db.delete(donations);
  await db.delete(npos);

  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: "EIN-RECEIPT",
      name: "Freegan Food Foundation",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
    })
    .returning();
  npo_id = npo!.id;

  await db.insert(donations).values({
    id: DON_ID,
    upusd: 1,
    status: "settled",
    amount_base: 100,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
  });
  await db.insert(donation_recipients).values({
    donation_id: DON_ID,
    npo_id,
    name: "Freegan Food Foundation",
    type: "npo",
  });
  await db.insert(donation_donors).values({
    donation_id: DON_ID,
    email: "donor@test.com",
    name: "Ada Lovelace",
  });
});

const don = (): IDonation => ({
  id: DON_ID,
  to_id: String(npo_id),
  to_name: "Freegan Food Foundation",
  to_type: "npo",
  to_tip_allowed: false,
  to_members: [],
  from_email: "donor@test.com",
  from_name: "Ada Lovelace",
  status: "settled",
  upusd: 1,
  amount: { base: 100, tip: 0, fee_allowance: 0 },
  currency: "USD",
  source: "bg-marketplace",
  frequency: "one-time",
  via: "stripe:card",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
});

describe("handle_don_receipt - queue redelivery", () => {
  test("a redelivered receipt message mails the donor once", async () => {
    await handle_don_receipt(don());
    await handle_don_receipt(don());

    expect(send_email).toHaveBeenCalledOnce();
  });

  test("the donor never sees two receipt numbers for one donation", async () => {
    await handle_don_receipt(don());
    await handle_don_receipt(don());

    // a fresh tax_receipt_id per delivery is what makes a duplicate
    // unreconcilable: two numbers, one gift, and no way to tell which is real
    const ids = send_email.mock.calls.map(
      ([i]) => (i as any).node.props.tax_receipt_id
    );
    expect(new Set(ids).size).toBe(1);
  });
});

describe("handle_don_receipt - a send that fails", () => {
  test("rethrows so the failure surfaces instead of passing for sent", async () => {
    send_email.mockRejectedValueOnce(new Error("resend unavailable"));

    await expect(handle_don_receipt(don())).rejects.toThrow(
      "resend unavailable"
    );
  });

  test("releases the claim so a later delivery still mails the donor", async () => {
    send_email.mockRejectedValueOnce(new Error("resend unavailable"));
    await expect(handle_don_receipt(don())).rejects.toThrow();

    // a burnt claim over a refused send is permanent: the receipt is never
    // mailed, nothing retries, and the stamp says it went out
    await handle_don_receipt(don());

    expect(send_email).toHaveBeenCalledTimes(2);
  });

  test("the claim is not released by an ordinary redelivery", async () => {
    await handle_don_receipt(don());
    await handle_don_receipt(don());
    await handle_don_receipt(don());

    // the lease is only given back on a throw — a delivery that found the
    // claim taken must not hand it to the next one
    expect(send_email).toHaveBeenCalledOnce();
  });

  test("a release that fails too does not bury the send failure", async () => {
    send_email.mockRejectedValueOnce(new Error("resend unavailable"));
    fail_release.current = true;

    // the release runs on the way out of the send failure, so a throw from it
    // replaces the exception on the way up. what reaches sentry would then be
    // a db error, and the reason the donor never got the receipt is gone.
    await expect(handle_don_receipt(don())).rejects.toThrow(
      "resend unavailable"
    );
  });

  test("the release failure is still reported rather than swallowed", async () => {
    send_email.mockRejectedValueOnce(new Error("resend unavailable"));
    fail_release.current = true;

    await expect(handle_don_receipt(don())).rejects.toThrow();

    // the lease stays held until it expires, so nothing mails this donation's
    // receipt for the length of the lease — losing that silently is how it
    // stays unnoticed until a donor asks where their receipt is.
    expect(report_error).toHaveBeenCalledOnce();
  });
});

describe("handle_don_receipt - a holder that never comes back", () => {
  /** what a function killed mid-send leaves behind: claimed, never sent */
  const abandon_claim = async (age_ms: number) => {
    const db = test_db.current!.db;
    await db
      .update(donations)
      .set({
        receipt_claimed_at: new Date(Date.now() - age_ms).toISOString(),
        receipt_sent_at: null,
      })
      .where(eq(donations.id, DON_ID));
  };

  /** age out the claim without touching whatever the sends already recorded */
  const expire_claim = async () => {
    const db = test_db.current!.db;
    await db
      .update(donations)
      .set({
        receipt_claimed_at: new Date(
          Date.now() - RECEIPT_LEASE_MS - 60_000
        ).toISOString(),
      })
      .where(eq(donations.id, DON_ID));
  };

  test("a stale claim is reclaimed so the donor still gets the receipt", async () => {
    await abandon_claim(RECEIPT_LEASE_MS + 60_000);

    // nothing released this one — the worker holding it was killed between the
    // claim and the sends, so there is no throw and no catch. without the
    // expiry the donor's receipt is lost for good.
    await handle_don_receipt(don());

    expect(send_email).toHaveBeenCalledOnce();
  });

  test("a claim still inside its lease is left alone", async () => {
    await abandon_claim(60_000);

    // a send in progress, not a dead one. mailing over it is the duplicate the
    // claim exists to prevent.
    await handle_don_receipt(don());

    expect(send_email).not.toHaveBeenCalled();
  });

  test("a blip on the sent stamp does not cost the donor a second receipt", async () => {
    fail_stamp.times = 2;

    // the mails are already away at this point. losing the write that records
    // it would leave the row claimed-but-not-sent, and the lease expiry would
    // then hand a redelivery the right to mail a second receipt under a fresh
    // tax id — the exact duplicate the claim exists to prevent.
    await handle_don_receipt(don());
    await expire_claim();
    await handle_don_receipt(don());

    expect(send_email).toHaveBeenCalledOnce();
  });

  test("a sent stamp that never lands is reported and rethrown", async () => {
    fail_stamp.times = 99;

    await expect(handle_don_receipt(don())).rejects.toThrow("pg unavailable");

    // receipts went out that the donation row does not know about. it stays
    // claimed rather than released — releasing is what would invite the
    // duplicate — so the report is the only thing that says so.
    expect(send_email).toHaveBeenCalledOnce();
    expect(report_error).toHaveBeenCalledOnce();
  });

  test("an expired claim over receipts that did go out never re-sends", async () => {
    await handle_don_receipt(don());
    await expire_claim();

    // only the claim expires. the sent stamp is the permanent half, and it is
    // the reason an expiry can never mail a second receipt for one gift.
    await handle_don_receipt(don());

    expect(send_email).toHaveBeenCalledOnce();
  });
});
