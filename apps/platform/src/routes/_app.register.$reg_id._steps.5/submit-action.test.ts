import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { TStatus } from "@/reg/schema";
import { registrations } from "$/pg/schema/registration";
import type { TestDb } from "$/pg/test-utils/pglite";

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

vi.mock("$/kit/queue", () => ({ enqueue: vi.fn(async () => {}) }));

vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock({ session: true })
);

import { get_session } from "#/.server/auth";
import { enqueue } from "$/kit/queue";
import { reg_get } from "$/pg/queries/registration";
import { create_test_db } from "$/pg/test-utils/pglite";
import { submit_action } from "./submit-action";

const RID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const EMAIL = "jane@test.com";

/** every step answered — what `Progress.banking` reads as ready to submit */
const COMPLETE = {
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
  await test_db.current!.db.delete(registrations);
  vi.mocked(enqueue).mockClear();
  vi.mocked(get_session).mockResolvedValue({
    user: { id: "u-1", email: EMAIL, role: null } as any,
  });
});

const seed = (
  status: TStatus | null,
  fields: Partial<typeof COMPLETE> = COMPLETE
) =>
  test_db.current!.db.insert(registrations).values({
    id: RID,
    r_id: EMAIL,
    status,
    status_rejected_reason: status === "04" ? "missing docs" : null,
    ...fields,
  });

/** a thrown `Response` is the refusal; anything else is the action's answer */
const submit = () =>
  Promise.resolve(
    submit_action({
      request: new Request(`http://localhost/register/${RID}/5`, {
        method: "POST",
      }),
      params: { reg_id: RID },
      context: {} as any,
    } as any)
  ).then(
    (res) => res as Response,
    (thrown: unknown) => {
      if (thrown instanceof Response) return thrown;
      throw thrown;
    }
  );

describe("submit_action", () => {
  // an approved application sent back to review would leave the npo live while
  // the queue shows it pending.
  test("refuses an approved application with 409", async () => {
    await seed("03");

    const res = await submit();

    expect(res.status).toBe(409);
    expect((await reg_get(RID))?.status).toBe("03");
    expect(enqueue).not.toHaveBeenCalled();
  });

  test.each<TStatus | null>(["01", "04", null])(
    "sends a %s application to review",
    async (status) => {
      await seed(status);

      const res = await submit();

      expect(res).not.toBeInstanceOf(Response);
      const row = await reg_get(RID);
      expect(row?.status).toBe("02");
      expect(row?.status_rejected_reason).toBeNull();
      expect(enqueue).toHaveBeenCalledOnce();
    }
  );

  // both presses can read the draft before either writes; only the status check
  // in the write itself tells them apart.
  test("a double press submits once and refuses the second with 409", async () => {
    await seed("01");

    const statuses = (await Promise.all([submit(), submit()])).map((r) =>
      r instanceof Response ? r.status : "ok"
    );

    expect(statuses.sort()).toEqual([409, "ok"]);
    expect((await reg_get(RID))?.status).toBe("02");
    expect(enqueue).toHaveBeenCalledOnce();
  });

  test("refuses an incomplete application with 400", async () => {
    await seed("01", { r_first_name: "Jane" });

    const res = await submit();

    expect(res.status).toBe(400);
    expect((await reg_get(RID))?.status).toBe("01");
  });
});
