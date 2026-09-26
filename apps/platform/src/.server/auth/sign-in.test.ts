import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TestDb } from "$/pg/test-utils/pglite";

// --- hoisted refs ---

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

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

// --- imports (after mocks) ---

import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { eq } from "drizzle-orm";
import { referral_id } from "#/helpers/referral";
import * as schema from "$/pg/schema";
import { account, session, user as user_table } from "$/pg/schema/auth";
import { create_test_db } from "$/pg/test-utils/pglite";
import { auth_options } from "./options";
import { reset_rate_limits } from "./rate-limit";

const BASE_URL = "http://localhost:4200";
const VICTIM = "victim@example.com";
const RIGHT_PW = "Correct-horse-1";
const THROTTLED = "Too many sign-in attempts. Try again in a few minutes.";

let auth: ReturnType<typeof make_auth>;
const make_auth = (db: TestDb["db"]) =>
  betterAuth({
    ...auth_options({ send_login_link: async () => {}, referral_id }),
    secret: "test-secret-at-least-32-characters-long!!",
    baseURL: BASE_URL,
    basePath: "/api/auth",
    database: drizzleAdapter(db, { provider: "pg", schema }),
  });

beforeAll(async () => {
  test_db.current = await create_test_db();
  auth = make_auth(test_db.current.db);
});

beforeEach(async () => {
  reset_rate_limits();
  const db = test_db.current!.db;
  await db.delete(session);
  await db.delete(account);
  await db.delete(user_table);

  await auth.api.signUpEmail({
    body: {
      email: VICTIM,
      password: RIGHT_PW,
      name: "Vic",
      first_name: "Vic",
      last_name: "Tim",
    },
  });
  await db
    .update(user_table)
    .set({ emailVerified: true })
    .where(eq(user_table.email, VICTIM));
});

/** straight at the public better-auth route, skipping /login */
const post = (email: string, password: string, ip = "203.0.113.7") =>
  auth.handler(
    new Request(`${BASE_URL}/api/auth/sign-in/email`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
      headers: {
        "content-type": "application/json",
        origin: BASE_URL,
        "x-forwarded-for": ip,
      },
    })
  );

describe("password sign-in throttle", () => {
  it("refuses a direct POST to /sign-in/email after five wrong passwords", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await post(VICTIM, "wrong-guess")).status).toBe(401);
    }

    const sixth = await post(VICTIM, RIGHT_PW);

    expect(sixth.status).toBe(429);
    expect((await sixth.json()).message).toBe(THROTTLED);
  });

  it("refuses the 21st attempt from one ip, across addresses", async () => {
    for (let i = 0; i < 20; i++) {
      expect((await post(`user${i}@example.com`, "guess")).status).toBe(401);
    }

    expect((await post(VICTIM, RIGHT_PW)).status).toBe(429);
    expect((await post(VICTIM, RIGHT_PW, "198.51.100.9")).status).toBe(200);
  });

  it("spends no address's quota on attempts its ip was refused", async () => {
    for (let i = 0; i < 20; i++) await post(`user${i}@example.com`, "guess");
    for (let i = 0; i < 5; i++) {
      expect((await post(VICTIM, "guess")).status).toBe(429);
    }

    const elsewhere = "198.51.100.9";
    for (let i = 0; i < 5; i++) {
      expect((await post(VICTIM, "guess", elsewhere)).status).toBe(401);
    }
    expect((await post(VICTIM, RIGHT_PW, elsewhere)).status).toBe(429);
  });

  it("does not count a successful sign-in against the email", async () => {
    for (let i = 0; i < 6; i++) {
      expect((await post(VICTIM, RIGHT_PW)).status).toBe(200);
    }
  });
});
