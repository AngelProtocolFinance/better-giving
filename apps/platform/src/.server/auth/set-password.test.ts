import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

import { dash } from "@better-auth/infra";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { admin } from "better-auth/plugins/admin";
import { eq } from "drizzle-orm";
import { seed_password_user } from "#/__tests__/fixtures/password-user";
import { referral_id } from "#/helpers/referral";
import * as schema from "$/pg/schema";
import { session, user as user_table } from "$/pg/schema/auth";
import { create_test_db } from "$/pg/test-utils/pglite";
import { auth_options } from "./options";
import { revoke_sessions_on_set_password } from "./set-password";

const ORIGIN = "http://localhost:4200";
const DASH_API = "http://dash.test";
const DASH_KEY = "test-dash-api-key";
const PW = "old-password-1";

let auth: any;

/** the dash service's signing key. `/dash/*` verifies a short-lived jwt
 * against the service's jwks, so the stubbed service serves this key's half. */
const dash_key = (async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"]
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { pair, jwks: { keys: [{ ...jwk, kid: "k1", alg: "RS256" }] } };
})();

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const utf8 = (s: string) => new TextEncoder().encode(s);
const hex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join(
    ""
  );

/** the bearer the dashboard sends when an operator acts on `user_id` */
async function dash_bearer(user_id: string): Promise<Headers> {
  const { pair } = await dash_key;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(utf8(JSON.stringify({ alg: "RS256", kid: "k1" })));
  const body = b64url(
    utf8(
      JSON.stringify({
        userId: user_id,
        apiKeyHash: hex(await crypto.subtle.digest("SHA-256", utf8(DASH_KEY))),
        iat: now,
        exp: now + 60,
        jti: crypto.randomUUID(),
      })
    )
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    pair.privateKey,
    utf8(`${head}.${body}`)
  );
  return new Headers({
    authorization: `Bearer ${head}.${body}.${b64url(new Uint8Array(sig))}`,
  });
}

beforeAll(async () => {
  test_db.current = await create_test_db();
  const base = auth_options({ send_login_link: async () => {}, referral_id });
  auth = betterAuth({
    ...base,
    secret: "test-secret-at-least-32-characters-long!!",
    baseURL: ORIGIN,
    basePath: "/api/auth",
    database: drizzleAdapter(test_db.current.db, { provider: "pg", schema }),
    plugins: [
      admin(),
      dash({ apiKey: DASH_KEY, apiUrl: DASH_API, kvUrl: DASH_API }),
      revoke_sessions_on_set_password(),
    ],
  });
});

beforeEach(async () => {
  const { jwks } = await dash_key;
  const real_fetch = globalThis.fetch;
  // the dash plugin phones its service for the jwks and to report events
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new Request(input as RequestInfo).url;
    if (!url.startsWith(DASH_API)) return real_fetch(input, init);
    return url.endsWith("/api/auth/jwks")
      ? Response.json(jwks)
      : Response.json({});
  });
  await test_db.current!.db.delete(user_table);
});

/** a verified password user; returns its id */
async function seed_user(email: string, role = "user"): Promise<string> {
  await seed_password_user(auth, {
    email,
    password: PW,
    name: "Test User",
    first_name: "Test",
    last_name: "User",
  });
  const [row] = await test_db
    .current!.db.update(user_table)
    .set({ emailVerified: true, role })
    .where(eq(user_table.email, email))
    .returning({ id: user_table.id });
  return row!.id;
}

/** a signed-in session as a later request carries it: the session token alone.
 * the jwe cache cookie is left off so the lookup reaches the session store. */
async function sign_in(email: string, password = PW): Promise<Headers> {
  const { headers } = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });
  const token = (headers as Headers)
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .find((c) => c.startsWith("better-auth.session_token="));
  if (!token) throw new Error("sign-in set no session cookie");
  return new Headers({ cookie: token });
}

const live = async (headers: Headers) =>
  (await auth.api.getSession({ headers })) !== null;

const sessions_of = (user_id: string) =>
  test_db.current!.db.select().from(session).where(eq(session.userId, user_id));

describe("admin set-user-password", () => {
  it("signs the user out of every session, and leaves the admin's alone", async () => {
    await seed_user("admin@example.com", "admin");
    const target = await seed_user("donor@example.com");
    const admin_h = await sign_in("admin@example.com");
    const devices = [
      await sign_in("donor@example.com"),
      await sign_in("donor@example.com"),
    ];
    for (const h of devices) expect(await live(h)).toBe(true);

    await auth.api.setUserPassword({
      body: { userId: target, newPassword: "new-password-2" },
      headers: admin_h,
    });

    for (const h of devices) expect(await live(h)).toBe(false);
    expect(await sessions_of(target)).toHaveLength(0);
    expect(await live(admin_h)).toBe(true);
    expect(
      await live(await sign_in("donor@example.com", "new-password-2"))
    ).toBe(true);
  });

  it("signs nobody out when it refuses the password", async () => {
    await seed_user("admin@example.com", "admin");
    const target = await seed_user("donor@example.com");
    const admin_h = await sign_in("admin@example.com");
    const device = await sign_in("donor@example.com");

    await expect(
      auth.api.setUserPassword({
        body: { userId: target, newPassword: "short" },
        headers: admin_h,
      })
    ).rejects.toThrow();

    expect(await live(device)).toBe(true);
  });

  it("signs nobody out on an admin edit that isn't a password", async () => {
    await seed_user("admin@example.com", "admin");
    const target = await seed_user("donor@example.com");
    const admin_h = await sign_in("admin@example.com");
    const device = await sign_in("donor@example.com");

    await auth.api.adminUpdateUser({
      body: { userId: target, data: { name: "Renamed User" } },
      headers: admin_h,
    });

    expect(await live(device)).toBe(true);
  });
});

describe("dash set-password", () => {
  it("signs the user out of every session", async () => {
    const target = await seed_user("donor@example.com");
    const devices = [
      await sign_in("donor@example.com"),
      await sign_in("donor@example.com"),
    ];
    for (const h of devices) expect(await live(h)).toBe(true);

    await auth.api.setDashPassword({
      body: { password: "new-password-2" },
      headers: await dash_bearer(target),
    });

    for (const h of devices) expect(await live(h)).toBe(false);
    expect(await sessions_of(target)).toHaveLength(0);
    expect(
      await live(await sign_in("donor@example.com", "new-password-2"))
    ).toBe(true);
  });
});
