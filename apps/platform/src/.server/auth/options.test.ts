import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TestDb } from "$/pg/test-utils/pglite-browser";

// --- hoisted refs ---

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const test_auth_ref = vi.hoisted(() => ({ current: null as any }));

// --- mocks ---

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

vi.mock("$/email", () => ({
  send_email: vi.fn(),
  sender: "test <test@test.com>",
}));

// --- imports (after mocks) ---

import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { eq } from "drizzle-orm";
import { referral_id } from "#/helpers/referral";
import * as schema from "$/pg/schema";
import {
  account,
  session,
  user as user_table,
  verification,
} from "$/pg/schema/auth";
import { create_test_db } from "$/pg/test-utils/pglite-browser";
import { auth_options, login_link_plugin } from "./options";

const BASE_URL = "http://localhost:4200";
const TEST_SECRET = "test-secret-at-least-32-characters-long!!";
const TEST_EMAIL = "jane@example.com";
const TEST_PW = "Test1234!@";

beforeAll(async () => {
  test_db.current = await create_test_db();

  const deps = {
    send_login_link: async () => {},
    referral_id,
  };

  test_auth_ref.current = betterAuth({
    ...auth_options(deps),
    plugins: [login_link_plugin(deps)],
    secret: TEST_SECRET,
    baseURL: BASE_URL,
    basePath: "/api/auth",
    database: drizzleAdapter(test_db.current.db, { provider: "pg", schema }),
  });
});

beforeEach(async () => {
  const db = test_db.current!.db;
  await db.delete(verification);
  await db.delete(session);
  await db.delete(account);
  await db.delete(user_table);
});

/** a real signed-in session, as a `Cookie` header carries it. sign-up leaves
 * the row unverified by config, and only a verified row can sign in. */
async function sign_in(email = TEST_EMAIL) {
  await test_auth_ref.current.api.signUpEmail({
    body: {
      email,
      password: TEST_PW,
      name: email,
      first_name: "Jane",
      last_name: "Doe",
    },
  });
  await test_db
    .current!.db.update(user_table)
    .set({ emailVerified: true })
    .where(eq(user_table.email, email));

  const { headers } = await test_auth_ref.current.api.signInEmail({
    body: { email, password: TEST_PW },
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((c: string) => c.split(";")[0])
    .join("; ");
  const h = new Headers();
  h.set("cookie", cookie);
  return h;
}

const row = async (email = TEST_EMAIL) =>
  (
    await test_db
      .current!.db.select()
      .from(user_table)
      .where(eq(user_table.email, email))
  )[0]!;

describe("server-owned user fields", () => {
  it("refuses a client-supplied w_form on /update-user", async () => {
    const headers = await sign_in();

    await expect(
      test_auth_ref.current.api.updateUser({
        body: { w_form: "someone-elses-eid" },
        headers,
      })
    ).rejects.toThrow();

    expect((await row()).w_form).toBeNull();
  });

  it("refuses a client-supplied pay_id on /update-user", async () => {
    const headers = await sign_in();

    await expect(
      test_auth_ref.current.api.updateUser({
        body: { pay_id: "4242" },
        headers,
      })
    ).rejects.toThrow();

    expect((await row()).pay_id).toBeNull();
  });

  it("refuses a client-supplied pay_min on /update-user", async () => {
    const headers = await sign_in();

    await expect(
      test_auth_ref.current.api.updateUser({
        body: { pay_min: 1 },
        headers,
      })
    ).rejects.toThrow();

    expect((await row()).pay_min).toBe(0);
  });

  it("still takes a user-editable field on the same endpoint", async () => {
    const headers = await sign_in();

    await test_auth_ref.current.api.updateUser({
      body: { first_name: "Janet" },
      headers,
    });

    expect((await row()).first_name).toBe("Janet");
  });

  it("keeps signup working, and closed to the same three", async () => {
    const res = await test_auth_ref.current.api.signUpEmail({
      body: {
        email: "new@example.com",
        password: TEST_PW,
        name: "new",
        first_name: "Jane",
        last_name: "Doe",
      },
    });
    expect(res.user.email).toBe("new@example.com");
    expect((await row("new@example.com")).first_name).toBe("Jane");

    await expect(
      test_auth_ref.current.api.signUpEmail({
        body: {
          email: "other@example.com",
          password: TEST_PW,
          name: "other",
          first_name: "Jane",
          last_name: "Doe",
          w_form: "someone-elses-eid",
        },
      })
    ).rejects.toThrow();
  });
});
