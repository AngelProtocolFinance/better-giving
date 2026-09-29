import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TestDb } from "$/pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const test_auth_ref = vi.hoisted(() => ({ current: null as any }));
/** the configured BASE_URL, and so the auth instance's only trusted origin */
const ORIGIN = vi.hoisted(() => "http://localhost:4200");
/** every reset mail the config sends */
const sent_resets = vi.hoisted(() => [] as { email: string; url: string }[]);

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

vi.mock("$/env", () => ({ base_url: ORIGIN }));

vi.mock("./auth", () => ({
  auth: new Proxy(
    {},
    {
      get(_, prop) {
        if (!test_auth_ref.current) throw new Error("test auth not init");
        return (test_auth_ref.current as any)[prop];
      },
    }
  ),
}));

import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { eq } from "drizzle-orm";
import { while_token_writes_fail } from "#/__tests__/fixtures/token-writes";
import { referral_id } from "#/helpers/referral";
import * as schema from "$/pg/schema";
import { account, session, user as user_table } from "$/pg/schema/auth";
import { create_test_db } from "$/pg/test-utils/pglite";
import { LINK_PER_EMAIL, LINK_PER_IP } from "./login-link";
import { auth_options } from "./options";
import { request_password_reset } from "./password-reset";
import { reset_rate_limits } from "./rate-limit";

beforeAll(async () => {
  test_db.current = await create_test_db();
  const base = auth_options({ send_login_link: async () => {}, referral_id });
  test_auth_ref.current = betterAuth({
    ...base,
    secret: "test-secret-at-least-32-characters-long!!",
    baseURL: ORIGIN,
    basePath: "/api/auth",
    database: drizzleAdapter(test_db.current.db, { provider: "pg", schema }),
    // better-auth skips its origin checks when it detects a test run; the
    // emailed link's callbackURL is only checked in production without this
    advanced: { ...base.advanced, disableOriginCheck: false },
    emailAndPassword: {
      ...base.emailAndPassword,
      async sendResetPassword({ user, url }) {
        sent_resets.push({ email: user.email, url });
      },
    },
  });
});

beforeEach(async () => {
  reset_rate_limits();
  sent_resets.length = 0;
  await test_db.current!.db.delete(user_table);
});

/** the reset path only mails an address that has a user row */
async function seed_users(emails: string[]) {
  await test_db.current!.db.insert(user_table).values(
    emails.map((email, i) => ({
      id: `u${i}`,
      name: "Test User",
      email,
      emailVerified: true,
      first_name: "Test",
      last_name: "User",
    }))
  );
}

/** a host the project serves that isn't BASE_URL's, e.g. a deployment url */
const OTHER_HOST = "https://platform-git-feature.vercel.app";

const from_ip = (ip: string, origin = ORIGIN) =>
  new Request(`${origin}/login/reset`, {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });

describe("request_password_reset", () => {
  it("mails a reset link that lands back on the set-password step", async () => {
    await seed_users(["donor@example.com"]);

    await request_password_reset("Donor@Example.com", from_ip("203.0.113.7"));

    expect(sent_resets).toHaveLength(1);
    expect(sent_resets[0]!.email).toBe("donor@example.com");
    const callback = new URL(sent_resets[0]!.url).searchParams.get(
      "callbackURL"
    );
    expect(callback).toBe(
      `${ORIGIN}/login/reset?type=set-password&email=donor%40example.com`
    );
  });

  it("mails a callback on BASE_URL's origin when asked from another host", async () => {
    await seed_users(["donor@example.com"]);

    await request_password_reset(
      "donor@example.com",
      from_ip("203.0.113.7", OTHER_HOST)
    );

    const callback = new URL(sent_resets[0]!.url).searchParams.get(
      "callbackURL"
    );
    expect(callback).toBe(
      `${ORIGIN}/login/reset?type=set-password&email=donor%40example.com`
    );
  });

  it("stops mailing one address once its quota is spent, silently", async () => {
    await seed_users(["victim@example.com"]);
    for (let i = 0; i < LINK_PER_EMAIL.max; i++) {
      await request_password_reset(
        "victim@example.com",
        from_ip("203.0.113.7")
      );
    }
    expect(sent_resets).toHaveLength(LINK_PER_EMAIL.max);

    // another source, and another spelling of the address, still hit the cap —
    // and the caller learns nothing, so its screen stays the same
    await expect(
      request_password_reset("Victim@Example.com", from_ip("198.51.100.4"))
    ).resolves.toBeUndefined();
    expect(sent_resets).toHaveLength(LINK_PER_EMAIL.max);
  });

  it("stops one source mailing across many addresses, silently", async () => {
    const emails = Array.from(
      { length: LINK_PER_IP.max + 1 },
      (_, i) => `donor${i}@example.com`
    );
    await seed_users(emails);

    for (const email of emails.slice(0, -1)) {
      await request_password_reset(email, from_ip("203.0.113.9"));
    }
    expect(sent_resets).toHaveLength(LINK_PER_IP.max);

    // a fresh address is inside its own quota — the source is what ran out
    const last = emails.at(-1)!;
    await expect(
      request_password_reset(last, from_ip("203.0.113.9"))
    ).resolves.toBeUndefined();
    expect(sent_resets).toHaveLength(LINK_PER_IP.max);

    // and a different source still gets through for that same address
    await request_password_reset(last, from_ip("198.51.100.4"));
    expect(sent_resets).toHaveLength(LINK_PER_IP.max + 1);
  });

  it("never charges an address for a source already over its cap", async () => {
    const victim = "victim@example.com";
    const fillers = Array.from(
      { length: LINK_PER_IP.max },
      (_, i) => `donor${i}@example.com`
    );
    await seed_users([victim, ...fillers]);
    for (const email of fillers) {
      await request_password_reset(email, from_ip("203.0.113.9"));
    }

    for (let i = 0; i < LINK_PER_EMAIL.max; i++) {
      await request_password_reset(victim, from_ip("203.0.113.9"));
    }
    expect(sent_resets).toHaveLength(LINK_PER_IP.max);

    // the victim's own quota is whole
    sent_resets.length = 0;
    for (let i = 0; i < LINK_PER_EMAIL.max; i++) {
      await request_password_reset(victim, from_ip("198.51.100.4"));
    }
    expect(sent_resets).toHaveLength(LINK_PER_EMAIL.max);
  });

  it("hands the source back a request the address refused", async () => {
    const victim = "victim@example.com";
    const fresh = Array.from(
      { length: LINK_PER_IP.max - LINK_PER_EMAIL.max },
      (_, i) => `donor${i}@example.com`
    );
    await seed_users([victim, ...fresh]);
    // spends the address, then asks past it until the source's cap is covered
    for (let i = 0; i < LINK_PER_IP.max; i++) {
      await request_password_reset(victim, from_ip("203.0.113.9"));
    }
    expect(sent_resets).toHaveLength(LINK_PER_EMAIL.max);

    for (const email of fresh) {
      await request_password_reset(email, from_ip("203.0.113.9"));
    }
    expect(sent_resets).toHaveLength(LINK_PER_IP.max);
  });

  it("hands an address back a request the adapter failed", async () => {
    await seed_users(["victim@example.com"]);
    await while_token_writes_fail(test_db.current!, async () => {
      for (let i = 0; i < LINK_PER_EMAIL.max; i++) {
        await expect(
          request_password_reset("victim@example.com", from_ip("203.0.113.7"))
        ).rejects.toThrow();
      }
    });
    expect(sent_resets).toHaveLength(0);

    await request_password_reset("victim@example.com", from_ip("203.0.113.7"));
    expect(sent_resets).toHaveLength(1);
  });
});

describe("POST /api/auth/request-password-reset", () => {
  it("is refused over http, while the throttled seam still mails", async () => {
    await seed_users(["donor@example.com"]);

    const res: Response = await test_auth_ref.current.handler(
      new Request(`${ORIGIN}/api/auth/request-password-reset`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "donor@example.com" }),
      })
    );
    expect(res.status).toBe(404);
    expect(sent_resets).toHaveLength(0);

    await request_password_reset("donor@example.com", from_ip("203.0.113.7"));
    expect(sent_resets).toHaveLength(1);
  });

  it("still serves the emailed link, handing its token to the set-password step", async () => {
    await seed_users(["donor@example.com"]);
    await request_password_reset("donor@example.com", from_ip("203.0.113.7"));
    const link = sent_resets[0]!.url;
    const token = new URL(link).pathname.split("/reset-password/")[1];

    const res: Response = await test_auth_ref.current.handler(
      new Request(link)
    );

    expect(res.status).toBe(302);
    const to = new URL(res.headers.get("location")!);
    expect(`${to.origin}${to.pathname}`).toBe(`${ORIGIN}/login/reset`);
    expect(to.searchParams.get("type")).toBe("set-password");
    expect(to.searchParams.get("token")).toBe(token);
  });

  it("serves the link mailed to a reset started on another host", async () => {
    await seed_users(["donor@example.com"]);
    await request_password_reset(
      "donor@example.com",
      from_ip("203.0.113.7", OTHER_HOST)
    );

    const res: Response = await test_auth_ref.current.handler(
      new Request(sent_resets[0]!.url)
    );

    expect(res.status).toBe(302);
    const to = new URL(res.headers.get("location")!);
    expect(`${to.origin}${to.pathname}`).toBe(`${ORIGIN}/login/reset`);
  });
});

/** a signed-in session as a later request carries it: the session token alone.
 * the jwe cache cookie is left off so the lookup reaches the session store. */
async function sign_in(email: string, password: string): Promise<Headers> {
  const { headers } = await test_auth_ref.current.api.signInEmail({
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

/** resets `email` through the emailed link, as the set-password step does */
async function reset_via_link(email: string, new_pw: string) {
  await request_password_reset(email, from_ip("203.0.113.7"));
  const token = new URL(sent_resets.at(-1)!.url).pathname.split(
    "/reset-password/"
  )[1];
  await test_auth_ref.current.api.resetPassword({
    body: { newPassword: new_pw, token },
  });
}

describe("resetting a password", () => {
  const email = "donor@example.com";
  const old_pw = "old-password-1";
  const new_pw = "new-password-2";

  async function signed_up_on_two_devices(): Promise<Headers[]> {
    await test_auth_ref.current.api.signUpEmail({
      body: {
        email,
        password: old_pw,
        name: "Test User",
        first_name: "Test",
        last_name: "User",
      },
    });
    await test_db
      .current!.db.update(user_table)
      .set({ emailVerified: true })
      .where(eq(user_table.email, email));
    const devices = [
      await sign_in(email, old_pw),
      await sign_in(email, old_pw),
    ];
    for (const headers of devices) {
      expect(
        await test_auth_ref.current.api.getSession({ headers })
      ).not.toBeNull();
    }
    return devices;
  }

  it("signs the user out of every session, and the new password signs in", async () => {
    const devices = await signed_up_on_two_devices();

    await reset_via_link(email, new_pw);

    for (const headers of devices) {
      expect(
        await test_auth_ref.current.api.getSession({ headers })
      ).toBeNull();
    }
    const [{ id }] = await test_db
      .current!.db.select({ id: user_table.id })
      .from(user_table)
      .where(eq(user_table.email, email));
    const left = await test_db
      .current!.db.select()
      .from(session)
      .where(eq(session.userId, id));
    expect(left).toHaveLength(0);

    const fresh = await sign_in(email, new_pw);
    expect(
      (await test_auth_ref.current.api.getSession({ headers: fresh }))?.user
        .email
    ).toBe(email);
  });

  it("signs a user setting a first password out of every session", async () => {
    const devices = await signed_up_on_two_devices();
    // passwordless from here on, as a migrated or google-only user is
    await test_db
      .current!.db.delete(account)
      .where(eq(account.providerId, "credential"));

    await reset_via_link(email, new_pw);

    for (const headers of devices) {
      expect(
        await test_auth_ref.current.api.getSession({ headers })
      ).toBeNull();
    }
    const fresh = await sign_in(email, new_pw);
    expect(
      (await test_auth_ref.current.api.getSession({ headers: fresh }))?.user
        .email
    ).toBe(email);
  });
});
