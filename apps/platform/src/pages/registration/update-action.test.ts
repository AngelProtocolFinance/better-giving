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
import { update_action } from "./update-action";

const RID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const EMAIL = "jane@test.com";
const SEEN_AT = "2026-09-01T00:00:00.000Z";

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

const seed = (status: TStatus | null) =>
  test_db.current!.db.insert(registrations).values({
    id: RID,
    r_id: EMAIL,
    status,
    o_website: "https://before.org",
    updated_at: SEEN_AT,
  });

const save_org_step = () =>
  update_action("3")({
    request: new Request(`http://localhost/register/${RID}/2`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        update_type: "org",
        o_website: "https://after.org",
      }),
    }),
    params: { reg_id: RID },
    context: {} as any,
  } as any);

/** a thrown `Response` is the refusal; anything else is the action's answer */
const settle = (p: unknown) =>
  Promise.resolve(p).then(
    (res) => res as Response,
    (thrown: unknown) => {
      if (thrown instanceof Response) return thrown;
      throw thrown;
    }
  );

describe("update_action — step save", () => {
  // a step form left open in another tab still posts after the applicant
  // submitted, or after review approved them. it lands where the step loader
  // would have sent that tab, not on an error page.
  test.each<[TStatus, string]>([
    ["02", `/register/${RID}/5`],
    ["03", "/register/success"],
  ])(
    "sends a %s application to %s and writes nothing",
    async (status, path) => {
      await seed(status);

      const res = await settle(save_org_step());

      expect(res.status).toBe(302);
      expect(
        new URL(res.headers.get("location")!, "http://localhost").pathname
      ).toBe(path);
      const row = await reg_get(RID);
      expect(row?.status).toBe(status);
      expect(row?.o_website).toBe("https://before.org");
      expect(enqueue).not.toHaveBeenCalled();
    }
  );

  test("refuses another user's save with 401 and writes nothing", async () => {
    await seed("01");
    vi.mocked(get_session).mockResolvedValue({
      user: { id: "u-2", email: "mallory@test.com", role: null } as any,
    });

    const res = await settle(save_org_step());

    expect(res.status).toBe(401);
    expect(await reg_get(RID)).toMatchObject({
      o_website: "https://before.org",
      updated_at: SEEN_AT,
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  // a rejected application is reopened by editing it; a legacy row with no
  // status is a draft, as the review step reads it.
  test.each<TStatus | null>(["01", "04", null])(
    "saves a %s application back to draft",
    async (status) => {
      await seed(status);

      const res = await settle(save_org_step());

      expect(res.status).toBe(302);
      const row = await reg_get(RID);
      expect(row?.status).toBe("01");
      expect(row?.o_website).toBe("https://after.org");
      expect(enqueue).toHaveBeenCalledOnce();
    }
  );
});
