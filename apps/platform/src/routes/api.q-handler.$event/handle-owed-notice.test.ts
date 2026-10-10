import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { TestDb } from "$/pg/test-utils/pglite";

// the notice lease, the owed rows and the recipients are real pglite; smtp
// and error reporting are the fakes
const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
vi.mock("$/pg/db", () => ({
  db: new Proxy({} as any, {
    get(_, prop) {
      return (test_db.current!.db as any)[prop];
    },
  }),
}));
// "" is no date: no row reaches its party
const terms = vi.hoisted(() => ({ date: "" }));
vi.mock("@/terms", async (io) => ({
  ...(await io<typeof import("@/terms")>()),
  get TERMS_EFFECTIVE() {
    return terms.date;
  },
}));
const send_email_or_throw = vi.hoisted(() => vi.fn(async (_: any) => ({})));
vi.mock("$/email", () => ({ send_email_or_throw }));
const report_error = vi.hoisted(() => vi.fn());
vi.mock("#/errors/report", () => ({ report_error }));

import { eq } from "drizzle-orm";
import type { ReactElement } from "react";
import { render } from "react-email";
import { seed_npo, seed_user } from "#/__tests__/fixtures/funds";
import { emails } from "@/constants/common";
import type { DbOrTx } from "$/pg/queries/helpers";
import {
  credit_owed,
  type OwedParty,
  record_owed,
  write_off_owed,
} from "$/pg/queries/owed";
import { claim_owed_notice, owed_notices_due } from "$/pg/queries/owed-notice";
import { user } from "$/pg/schema/auth";
import { donations } from "$/pg/schema/donation";
import { npos } from "$/pg/schema/npo";
import { owed_amounts } from "$/pg/schema/owed";
import { loss_logs } from "$/pg/schema/revenue";
import { user_npo_memberships } from "$/pg/schema/user";
import { create_test_db } from "$/pg/test-utils/pglite";
import { handle_owed_notice } from "./handle-owed-notice";

const db = () => test_db.current!.db;
const as_db = (x: unknown) => x as DbOrTx;

/** the terms' date, before every gift here */
const TERMS_DATE = "2026-11-01";
const NOW = "2026-11-20T12:00:00.000Z";

let npo_id: number;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  terms.date = TERMS_DATE;
  await db().delete(loss_logs);
  await db().delete(owed_amounts);
  await db().delete(donations);
  await db().delete(user_npo_memberships);
  await db().delete(npos);
  await db().delete(user);
  npo_id = (await seed_npo(db(), {
    name: "Rainforest Trust",
    registration_number: "EIN-A",
  }))!.id;
  const admin = await seed_user(db(), "admin@rainforest.org", "Ana");
  await db()
    .insert(user_npo_memberships)
    .values({ user_id: admin!.id, npo_id });
  await db().insert(donations).values({
    id: "don-1",
    upusd: 1,
    status: "settled",
    amount_base: 100,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
    created_at: "2026-11-05T10:00:00.000Z",
  });
});

afterEach(() => {
  vi.clearAllMocks();
  send_email_or_throw.mockImplementation(async () => ({}));
});

/** the refund webhook's write, as each delivery of one event makes it */
const refund = (party: OwedParty = { npo_id }) =>
  db().transaction((tx) =>
    record_owed(as_db(tx), {
      donation_id: "don-1",
      party,
      source: "refund",
      source_ref: "re_1",
      received_usd: 90,
      fee_processing_usd: 3.2,
      now: NOW,
    })
  );

const due = () => owed_notices_due(50, as_db(db()));

/** one delivery of the notice's message */
const notify = (id: string) => handle_owed_notice(as_db(db()), { id });

/** every due notice delivered once, as the cron's enqueue would */
const deliver_due = async () => {
  for (const n of await due()) await notify(n.id);
};

describe("handle_owed_notice", () => {
  test("mails a recorded row once to the npo's admins, however often it is recorded or delivered", async () => {
    await refund();
    await refund();
    const [notice] = await due();

    await notify(notice!.id);
    await notify(notice!.id);
    await refund();
    await deliver_due();

    expect(send_email_or_throw).toHaveBeenCalledOnce();
    const [mail] = send_email_or_throw.mock.calls[0]!;
    expect(mail).toMatchObject({
      to: ["admin@rainforest.org"],
      bcc: [emails.hi],
      subject: "Amount owed on a refunded gift: don-1",
    });
  });

  test("a referrer's row mails the referrer: a person at their own address, a nonprofit at its admins", async () => {
    const ref = await seed_user(db(), "jane@example.com", "Jane");
    await db()
      .update(user)
      .set({ referral_code: "REF-JANE" })
      .where(eq(user.id, ref!.id));
    const referring = await seed_npo(db(), {
      name: "Referring Org",
      registration_number: "EIN-R",
      referral_id: "NPO-R",
    });
    const ref_admin = await seed_user(db(), "admin@referring.org", "Rex");
    await db()
      .insert(user_npo_memberships)
      .values({ user_id: ref_admin!.id, npo_id: referring!.id });

    await refund({ referrer_user: "REF-JANE" });
    await deliver_due();
    await refund({ referrer_npo: "NPO-R" });
    await deliver_due();

    const [to_jane, to_org] = send_email_or_throw.mock.calls.map(([m]) => m);
    expect(to_jane).toMatchObject({ to: ["jane@example.com"] });
    expect(to_org).toMatchObject({
      to: ["admin@referring.org"],
      bcc: [emails.hi],
    });
  });

  test("a refused send gives the claim back, so the retry mails it", async () => {
    await refund();
    const [notice] = await due();
    send_email_or_throw.mockRejectedValueOnce(new Error("smtp 451"));

    await expect(notify(notice!.id)).rejects.toThrow("smtp 451");
    await notify(notice!.id);

    expect(send_email_or_throw).toHaveBeenCalledTimes(2);
    expect(await due()).toEqual([]);
  });

  test("a delivery inside another holder's lease mails nothing and acks, leaving the notice to the cron", async () => {
    await refund();
    const [notice] = await due();
    await claim_owed_notice(notice!.id, as_db(db()));

    await expect(notify(notice!.id)).resolves.toBeUndefined();

    expect(send_email_or_throw).not.toHaveBeenCalled();
  });

  test("a credit-back and a write-off each mail one follow-up", async () => {
    const admin = await seed_user(db(), "ops@better.giving");
    const row = await refund();
    await deliver_due();
    await credit_owed(as_db(db()), {
      donation_id: "don-1",
      party: { npo_id },
      usd: 40,
      reason: "dispute_won",
      ref: "dp_1",
      now: NOW,
    });
    await deliver_due();
    await deliver_due();
    await write_off_owed(as_db(db()), {
      owed_id: row.id,
      reason: "goodwill",
      actor: admin!.id,
      now: NOW,
    });
    await deliver_due();
    await deliver_due();

    expect(send_email_or_throw.mock.calls.map(([m]) => m.subject)).toEqual([
      "Amount owed on a refunded gift: don-1",
      "Amount owed credited back: don-1",
      "Amount owed waived: don-1",
    ]);
  });

  test("a failed refund's credit is mailed as the refund failing, for what it credited", async () => {
    await refund();
    await deliver_due();
    await fail_refund();
    await deliver_due();

    const [, mail] = send_email_or_throw.mock.calls.map(([m]) => m);
    expect(mail.subject).toBe("Amount owed credited back: don-1");
    const text = await mail_text(mail);
    expect(text).toMatch(/refund of the .* failed, .* credited back \$93\.20/);
    expect(text).not.toMatch(/\$0\.00/);
  });

  test("a recorded notice whose row was settled before it went is not mailed; the settling one is", async () => {
    await refund();
    await fail_refund();
    await deliver_due();

    expect(send_email_or_throw.mock.calls.map(([m]) => m.subject)).toEqual([
      "Amount owed credited back: don-1",
    ]);
  });

  test("a dispute's credit is mailed as the dispute settled, whatever settled it", async () => {
    await dispute();
    await deliver_due();
    await win_dispute();
    await deliver_due();

    const [, mail] = send_email_or_throw.mock.calls.map(([m]) => m);
    expect(mail.subject).toBe("Amount owed credited back: don-1");
    const text = await mail_text(mail);
    expect(text).toMatch(
      /we credited back \$93\.20 of what was owed on the .*, because its dispute was settled\./
    );
    expect(text).not.toMatch(/\$0\.00/);
  });

  test("a row owing again after it was settled is mailed as owed again, the won figures not added back", async () => {
    await dispute();
    await deliver_due();
    await win_dispute();
    await deliver_due();
    // a later dispute takes the gift whole again, with its fee
    await dispute(15);
    await deliver_due();

    const mails = send_email_or_throw.mock.calls.map(([m]) => m);
    expect(mails.map((m) => m.subject)).toEqual([
      "Amount owed on a disputed gift: don-1",
      "Amount owed credited back: don-1",
      "Amount owed on a disputed gift: don-1",
    ]);
    expect(await mail_text(mails[0])).not.toMatch(/owed again/);
    const again = await mail_text(mails[2]);
    expect(again).toMatch(/\$108\.20 is owed again/);
    expect(again).toMatch(
      /Credited back when the dispute was settled: \$93\.20/
    );
    expect(again).toMatch(/You received: \$90\.00/);
    expect(again).toMatch(/Total owed: \$108\.20/);
  });
});

/** the dispute's record of the gift, as the refund core writes it */
const dispute = (fee_dispute_usd = 0) =>
  db().transaction((tx) =>
    record_owed(as_db(tx), {
      donation_id: "don-1",
      party: { npo_id },
      source: "dispute",
      source_ref: "dp_1",
      received_usd: 90,
      fee_processing_usd: 3.2,
      fee_dispute_usd,
      now: NOW,
    })
  );

/** the win, booked as the takes ledger books it: one credit per figure */
async function win_dispute() {
  for (const [reason, usd, ref] of [
    ["dispute_won", 90, "dp_1"],
    ["dispute_won_fee", 3.2, "dp_1:fee"],
  ] as const) {
    await credit_owed(as_db(db()), {
      donation_id: "don-1",
      party: { npo_id },
      usd,
      reason,
      ref,
      now: NOW,
    });
  }
}

/** the refund core's write when the recorded refund fails in full */
async function fail_refund() {
  for (const [reason, usd] of [
    ["refund_failed", 90],
    ["refund_failed_fee", 3.2],
  ] as const) {
    await credit_owed(as_db(db()), {
      donation_id: "don-1",
      party: { npo_id },
      usd,
      reason,
      ref: `${reason}:re_1`,
      now: NOW,
    });
  }
}

const mail_text = (m: { node: ReactElement }) =>
  render(m.node, { plainText: true });
