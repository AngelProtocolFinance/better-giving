import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { IMsg } from "@/queue/types";
import { user } from "$/pg/schema/auth";
import { banking_apps } from "$/pg/schema/banking";
import { npos } from "$/pg/schema/npo";
import { registrations } from "$/pg/schema/registration";
import { user_npo_memberships } from "$/pg/schema/user";
import type { TestDb } from "$/pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const enqueued = vi.hoisted(() => [] as IMsg[]);
const send_email = vi.hoisted(() =>
  vi.fn(async (_: { subject: string; to: string[] }) => ({ data: null }))
);

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

vi.mock("$/kit/queue", () => ({
  enqueue: vi.fn(async (...msgs: IMsg[]) => {
    enqueued.push(...msgs);
  }),
}));

vi.mock("$/kit/wise", () => ({
  wise: {
    v2_account: vi.fn(async () => ({
      longAccountSummary: "Test Bank ***1234",
      accountNumber: "***1234",
      name: { fullName: "Test Bank" },
      address: { city: "Austin", country: "US" },
      details: { abartn: "111000025" },
    })),
  },
}));

// the delivery half: the handler the approval's payload lands in, with its
// outbound calls stubbed so only its branching is exercised.
vi.mock("$/email", () => ({
  send_email,
  send_email_or_throw: vi.fn(),
  sender: "test <test@test.com>",
}));
vi.mock("$/kit/discord", () => ({
  bg_sales: { send_alert: vi.fn(async () => ({ status: 200 })) },
}));
vi.mock("#/routes/api.q-handler.$event/handle-reg/hubspot", () => ({
  create_deal: vi.fn(async () => ({})),
  update_or_create_company: vi.fn(async () => ({ id: "c-1" })),
  update_or_create_contact: vi.fn(async () => ({ id: "p-1" })),
}));
vi.mock("#/.server/auth/auth", () => ({ auth: {} }));

import { handle_reg_updated } from "#/routes/api.q-handler.$event/handle-reg";
import { wise } from "$/kit/wise";
import { reg_get } from "$/pg/queries/registration";
import { create_test_db } from "$/pg/test-utils/pglite";
import { action } from "./route";

const RID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const EMAIL = "jane@test.com";

/** every step answered and submitted */
const IN_REVIEW = {
  id: RID,
  r_id: EMAIL,
  status: "02",
  r_first_name: "Jane",
  r_last_name: "Doe",
  o_name: "Test Org",
  r_org_role: "ceo",
  rm: "search-engines",
  o_website: "https://example.org",
  o_hq_country: "United States",
  o_designation: "Charity",
  o_type: "501c3",
  o_ein: "123456789",
  o_bank_id: "999",
  o_bank_statement: "https://example.com/bank.pdf",
} as const;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  const db = test_db.current!.db;
  await db.delete(user_npo_memberships);
  await db.delete(banking_apps);
  await db.delete(registrations);
  await db.delete(npos);
  await db.delete(user);
  enqueued.length = 0;
  send_email.mockClear();
  vi.mocked(wise.v2_account).mockClear();

  await db.insert(user).values({
    id: "u-1",
    name: "Jane Doe",
    email: EMAIL,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    first_name: "Jane",
    last_name: "Doe",
  });
  await db.insert(registrations).values(IN_REVIEW);
});

/** a thrown `Response` is the refusal; anything else is the action's answer */
const verdict = (type: "approved" | "rejected") =>
  Promise.resolve(
    action({
      request: new Request(
        `http://localhost/platform/applications/${RID}/${type}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(type === "rejected" ? { reason: "no" } : {}),
        }
      ),
      params: { id: RID, verdict: type },
      context: {} as any,
    } as any)
  ).then(
    (res) => res as Response,
    (thrown: unknown) => {
      if (thrown instanceof Response) return thrown;
      throw thrown;
    }
  );

const reg_updates = () => enqueued.filter((m) => m.id === "reg-updated");

describe("approve", () => {
  test("enqueues the approved row, which mails the approval", async () => {
    const res = await verdict("approved");

    expect(res.status).toBe(302);
    const [m] = reg_updates();
    const npo_id = (await reg_get(RID))?.status_approved_npo_id;
    expect(m.payload).toMatchObject({
      id: RID,
      status: "03",
      status_approved_npo_id: npo_id,
    });

    await handle_reg_updated(m.payload as any);

    expect(send_email).toHaveBeenCalledOnce();
    expect(send_email.mock.calls[0][0]).toMatchObject({
      to: [EMAIL],
      subject: expect.stringMatching(/account has been created/),
    });
  });

  test("refuses a second approval with 409", async () => {
    await verdict("approved");

    const res = await verdict("approved");

    expect(res.status).toBe(409);
    expect(await test_db.current!.db.select().from(npos)).toHaveLength(1);
    expect(reg_updates()).toHaveLength(1);
  });

  // both pass the route's read of "02"; the claim at the top of the transaction
  // stops the loser before its npo insert, so there is nothing to roll back.
  test("two approvals at once create one npo", async () => {
    const statuses = await Promise.all([
      verdict("approved"),
      verdict("approved"),
    ]).then((rs) => rs.map((r) => r.status).sort());

    expect(wise.v2_account).toHaveBeenCalledTimes(2);
    expect(statuses).toEqual([302, 409]);
    expect(await test_db.current!.db.select().from(npos)).toHaveLength(1);
    expect(await test_db.current!.db.select().from(banking_apps)).toHaveLength(
      1
    );
    expect(reg_updates()).toHaveLength(1);
  });
});

describe("reject", () => {
  test("refuses a second rejection with 409 and mails once", async () => {
    await verdict("rejected");

    const res = await verdict("rejected");

    expect(res.status).toBe(409);
    for (const m of reg_updates()) await handle_reg_updated(m.payload as any);
    expect(send_email).toHaveBeenCalledOnce();
    expect(send_email.mock.calls[0][0].to).toEqual([EMAIL]);
  });

  test("two rejections at once mail once", async () => {
    const statuses = await Promise.all([
      verdict("rejected"),
      verdict("rejected"),
    ]).then((rs) => rs.map((r) => r.status).sort());

    expect(statuses).toEqual([302, 409]);
    expect(reg_updates()).toHaveLength(1);
    expect(reg_updates()[0].payload).toMatchObject({ status: "04" });
  });
});
