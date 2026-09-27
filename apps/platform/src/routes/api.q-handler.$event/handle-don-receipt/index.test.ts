import { eq } from "drizzle-orm";
import type { donation_receipt } from "emails";
import { render } from "react-email";
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
import type { TestDb } from "$/pg/test-utils/pglite";

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
const send_email_or_throw = vi.hoisted(() =>
  vi.fn(async (_i: { node: any; to: string[]; subject: string }) => ({
    id: "email-1",
    response: "250 ok",
  }))
);
vi.mock("$/email", () => ({ send_email_or_throw, sender: "test@test.com" }));

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
vi.mock("#/errors/report", () => ({ report_error }));

// --- imports (after mocks) ---

import { claim_receipt_send, RECEIPT_LEASE_MS } from "$/pg/queries/donation";
import { create_test_db } from "$/pg/test-utils/pglite";
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

    expect(send_email_or_throw).toHaveBeenCalledOnce();
  });

  test("the donor never sees two receipt numbers for one donation", async () => {
    await handle_don_receipt(don());
    await handle_don_receipt(don());

    // a fresh tax_receipt_id per delivery is what makes a duplicate
    // unreconcilable: two numbers, one gift, and no way to tell which is real
    const ids = send_email_or_throw.mock.calls.map(
      ([i]) => (i as any).node.props.tax_receipt_id
    );
    expect(new Set(ids).size).toBe(1);
  });
});

describe("claim_receipt_send - a refund that landed first", () => {
  const set_status = async (status: IDonation["status"]) => {
    const db = test_db.current!.db;
    await db.update(donations).set({ status }).where(eq(donations.id, DON_ID));
  };

  const claimed_at = async () => {
    const db = test_db.current!.db;
    const [row] = await db
      .select({ at: donations.receipt_claimed_at })
      .from(donations)
      .where(eq(donations.id, DON_ID));
    return row!.at;
  };

  test("a settled donation with no receipt sent is claimed", async () => {
    expect(await claim_receipt_send(DON_ID)).toBe(true);
    expect(await claimed_at()).not.toBeNull();
  });

  test.each(["refunded", "refunded_loss"] as const)(
    "a %s donation is refused and left unclaimed",
    async (status) => {
      await set_status(status);

      expect(await claim_receipt_send(DON_ID)).toBe(false);
      expect(await claimed_at()).toBeNull();
    }
  );

  test("a receipt message still saying settled mails nothing for a refunded row", async () => {
    await set_status("refunded");

    // the payload was built before the refund committed, so it is the row, not
    // the message, that has to stop the tax receipt for money that went back
    await handle_don_receipt(don());

    expect(send_email_or_throw).not.toHaveBeenCalled();
  });
});

describe("handle_don_receipt - a send that fails", () => {
  test("rethrows so the failure surfaces instead of passing for sent", async () => {
    send_email_or_throw.mockRejectedValueOnce(new Error("resend unavailable"));

    await expect(handle_don_receipt(don())).rejects.toThrow(
      "resend unavailable"
    );
  });

  test("releases the claim so a later delivery still mails the donor", async () => {
    send_email_or_throw.mockRejectedValueOnce(new Error("resend unavailable"));
    await expect(handle_don_receipt(don())).rejects.toThrow();

    // a burnt claim over a refused send is permanent: the receipt is never
    // mailed, nothing retries, and the stamp says it went out
    await handle_don_receipt(don());

    expect(send_email_or_throw).toHaveBeenCalledTimes(2);
  });

  test("the claim is not released by an ordinary redelivery", async () => {
    await handle_don_receipt(don());
    await handle_don_receipt(don());
    await handle_don_receipt(don());

    // the lease is only given back on a throw — a delivery that found the
    // claim taken must not hand it to the next one
    expect(send_email_or_throw).toHaveBeenCalledOnce();
  });

  test("a release that fails too does not bury the send failure", async () => {
    send_email_or_throw.mockRejectedValueOnce(new Error("resend unavailable"));
    fail_release.current = true;

    // the release runs on the way out of the send failure, so a throw from it
    // replaces the exception on the way up. what reaches sentry would then be
    // a db error, and the reason the donor never got the receipt is gone.
    await expect(handle_don_receipt(don())).rejects.toThrow(
      "resend unavailable"
    );
  });

  test("the release failure is still reported rather than swallowed", async () => {
    send_email_or_throw.mockRejectedValueOnce(new Error("resend unavailable"));
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

    expect(send_email_or_throw).toHaveBeenCalledOnce();
  });

  test("a claim still inside its lease is left alone", async () => {
    await abandon_claim(60_000);

    // a send in progress, not a dead one. mailing over it is the duplicate the
    // claim exists to prevent.
    await handle_don_receipt(don());

    expect(send_email_or_throw).not.toHaveBeenCalled();
  });

  test("a blip on the sent stamp does not cost the donor a second receipt", async () => {
    // a neon pool reconnect, not a one-off: the retry span exists to outlast
    // several failed attempts, so failing fewer than that proves nothing
    fail_stamp.times = 4;

    // the mails are already away at this point. losing the write that records
    // it would leave the row claimed-but-not-sent, and the lease expiry would
    // then hand a redelivery the right to mail a second receipt — the exact
    // duplicate the claim exists to prevent.
    await handle_don_receipt(don());
    await expire_claim();
    await handle_don_receipt(don());

    expect(send_email_or_throw).toHaveBeenCalledOnce();
  });

  test("a sent stamp that never lands is reported and rethrown", async () => {
    fail_stamp.times = 99;

    await expect(handle_don_receipt(don())).rejects.toThrow("pg unavailable");

    // receipts went out that the donation row does not know about. it stays
    // claimed rather than released — releasing is what would invite the
    // duplicate — so the report is the only thing that says so.
    expect(send_email_or_throw).toHaveBeenCalledOnce();
    expect(report_error).toHaveBeenCalledOnce();
  });

  test("an expired claim over receipts that did go out never re-sends", async () => {
    await handle_don_receipt(don());
    await expire_claim();

    // only the claim expires. the sent stamp is the permanent half, and it is
    // the reason an expiry can never mail a second receipt for one gift.
    await handle_don_receipt(don());

    expect(send_email_or_throw).toHaveBeenCalledOnce();
  });
});

describe("send_receipt - a gift to a fund", () => {
  const seed_members = async (names: string[], inactive: string[] = []) => {
    const db = test_db.current!.db;
    const rows = await db
      .insert(npos)
      .values(
        names.map((name, i) => ({
          registration_number: `EIN-FUND-${i}`,
          name,
          endow_designation: "Charity" as const,
          overview_pt: "[]",
          hq_country: "United States",
          active: !inactive.includes(name),
        }))
      )
      .returning();
    return rows.map((r) => String(r.id));
  };

  const fund_don = (to_members: string[]): IDonation => ({
    ...don(),
    to_id: "fund-1",
    to_name: "Climate Fund",
    to_type: "fund",
    to_members,
  });

  /** the one receipt mailed, as each line prints */
  const printed = () => {
    expect(send_email_or_throw).toHaveBeenCalledOnce();
    const p = send_email_or_throw.mock.calls[0]![0].node.props;
    return p.lines.map((l: any) => [l.name, l.amount.value.toFixed(2)]);
  };

  test("a tipped gift to three members is one receipt under one number", async () => {
    const members = await seed_members(["Alpha", "Beta", "Gamma"]);

    await handle_don_receipt({
      ...fund_don(members),
      amount: { base: 100, tip: 5, fee_allowance: 0 },
    });

    // one gift, one tax document: every member and the tip under one receipt
    // id, each line a row of it
    expect(printed()).toEqual([
      ["Alpha", "33.34"],
      ["Beta", "33.33"],
      ["Gamma", "33.33"],
      ["Better Giving", "5.00"],
    ]);
    const p = send_email_or_throw.mock.calls[0]![0].node.props;
    expect(p.lines.map((l: any) => l.kind)).toEqual([
      "beneficiary",
      "beneficiary",
      "beneficiary",
      "tip",
    ]);
    expect(p.amount.value).toBe(105);
    expect(p.tax_receipt_id).toEqual(expect.any(String));
  });

  test("the members' receipts add up to the gift", async () => {
    const members = await seed_members(["Alpha", "Beta", "Gamma"]);

    await handle_don_receipt(fund_don(members));

    // truncating each third prints 33.33 three times: a penny of a $100
    // charge that no receipt accounts for
    expect(printed()).toEqual([
      ["Alpha", "33.34"],
      ["Beta", "33.33"],
      ["Gamma", "33.33"],
    ]);
  });

  test("a member that no longer exists does not take a share", async () => {
    const [a, b] = await seed_members(["Alpha", "Beta"]);

    // a third of the gift split to a member with no receipt is money the
    // donor can't deduct
    await handle_don_receipt(fund_don([a!, "999999", b!]));

    expect(printed()).toEqual([
      ["Alpha", "50.00"],
      ["Beta", "50.00"],
    ]);
  });

  test("an inactive member gets no receipt, as it gets no payout", async () => {
    const members = await seed_members(["Alpha", "Beta", "Gamma"], ["Beta"]);

    await handle_don_receipt(fund_don(members));

    expect(printed()).toEqual([
      ["Alpha", "50.00"],
      ["Gamma", "50.00"],
    ]);
  });

  test("a crypto gift's receipts print the usd each member's share is worth", async () => {
    const members = await seed_members(["Alpha", "Beta", "Gamma"]);

    // 0.001 btc at $100k prints 0 btc per share; the usd figure is the one
    // the donor can deduct
    await handle_don_receipt({
      ...fund_don(members),
      currency: "BTC",
      upusd: 0.00001,
      amount: { base: 0.001, tip: 0, fee_allowance: 0 },
    });

    const usd = send_email_or_throw.mock.calls[0]![0].node.props.lines.map(
      (l: any) => l.amount.value_usd
    );
    expect(usd).toEqual([33.34, 33.33, 33.33]);
  });

  test("a fund with no funded member fails instead of passing for sent", async () => {
    const members = await seed_members(["Alpha"], ["Alpha"]);

    await expect(handle_don_receipt(fund_don(members))).rejects.toThrow(
      `no recipients for donation ${DON_ID}`
    );
    expect(send_email_or_throw).not.toHaveBeenCalled();
  });
});

describe("send_receipt - a gift to a nonprofit", () => {
  /** the one receipt mailed */
  const receipt = () => {
    expect(send_email_or_throw).toHaveBeenCalledOnce();
    return send_email_or_throw.mock.calls[0]![0].node
      .props as donation_receipt.IData;
  };

  test("a tipped gift is one receipt: the nonprofit and the tip", async () => {
    const db = test_db.current!.db;
    await db
      .update(npos)
      .set({ receipt_msg: "Thank you for feeding a family." })
      .where(eq(npos.id, npo_id));

    await handle_don_receipt({
      ...don(),
      program: { id: "p-1", name: "School Lunches" },
      amount: { base: 100, tip: 5, fee_allowance: 0 },
    });

    const r = receipt();
    expect(r.lines).toEqual([
      {
        kind: "beneficiary",
        name: "Freegan Food Foundation",
        amount: { value: 100, currency: "USD", value_usd: 100 },
        msg: "Thank you for feeding a family.",
        program: "School Lunches",
      },
      {
        kind: "tip",
        name: "Better Giving",
        amount: { value: 5, currency: "USD", value_usd: 5 },
      },
    ]);
    expect(r.amount.value).toBe(105);
    // the program is the nonprofit's, so it prints on the nonprofit's line
    expect(r).not.toHaveProperty("program_name");
  });

  test("an untipped gift has the nonprofit's line alone", async () => {
    await handle_don_receipt(don());

    expect(receipt().lines.map((l) => [l.kind, l.name])).toEqual([
      ["beneficiary", "Freegan Food Foundation"],
    ]);
  });

  test("a chariot gift carries no receipt number of ours", async () => {
    // the daf issues the donor's tax receipt for a grant
    await handle_don_receipt({ ...don(), via: "chariot" });

    expect(receipt().tax_receipt_id).toBeUndefined();
  });
});

describe("send_receipt - the mail the donor reads", () => {
  test("a tipped fund gift prints one receipt id", async () => {
    const db = test_db.current!.db;
    const rows = await db
      .insert(npos)
      .values(
        ["Alpha", "Beta"].map((name, i) => ({
          registration_number: `EIN-RENDER-${i}`,
          name,
          endow_designation: "Charity" as const,
          overview_pt: "[]",
          hq_country: "United States",
        }))
      )
      .returning();

    await handle_don_receipt({
      ...don(),
      to_id: "fund-1",
      to_name: "Climate Fund",
      to_type: "fund",
      to_members: rows.map((r) => String(r.id)),
      amount: { base: 100, tip: 5, fee_allowance: 0 },
    });

    expect(send_email_or_throw).toHaveBeenCalledOnce();
    const text = await render(send_email_or_throw.mock.calls[0]![0].node, {
      plainText: true,
    });
    expect(text.match(/Receipt ID/g)).toHaveLength(1);
  });
});
