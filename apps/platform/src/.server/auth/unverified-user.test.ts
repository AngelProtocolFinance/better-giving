import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TestDb } from "$/pg/test-utils/pglite-browser";

// --- hoisted refs ---

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const test_auth_ref = vi.hoisted(() => ({ current: null as any }));
const mock_send_email = vi.hoisted(() => vi.fn());
/** every login/verification link the config mails out */
const sent_links = vi.hoisted(() => [] as { email: string; url: string }[]);

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
  send_email: mock_send_email,
  sender: "test <test@test.com>",
}));

vi.mock("$/env", () => ({
  app: { session_secret: "test-secret-at-least-32-characters-long!!" },
  base_url: "http://localhost:4200",
}));

// the module under test imports the auth instance from its sibling — swap in
// the pglite-backed instance built below.
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
import { get_registrant, issue_draft_grant } from "./draft-grant";
import { LINK_PER_EMAIL, LINK_PER_IP, request_login_link } from "./login-link";
import { auth_options, login_link_plugin } from "./options";
import { reset_rate_limits } from "./rate-limit";
import { CREATE_PER_IP, create_unverified_user } from "./unverified-user";

const BASE_URL = "http://localhost:4200";
const TEST_SECRET = "test-secret-at-least-32-characters-long!!";

beforeAll(async () => {
  test_db.current = await create_test_db();

  const deps = {
    send_login_link: async (a: { email: string; url: string }) => {
      sent_links.push(a);
      mock_send_email(a);
    },
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
  mock_send_email.mockClear();
  sent_links.length = 0;
  const db = test_db.current!.db;
  await db.delete(verification);
  await db.delete(session);
  await db.delete(account);
  await db.delete(user_table);
});

describe("create_unverified_user", () => {
  it("creates a password-less, unverified user for a brand-new email", async () => {
    const res = await create_unverified_user({ email: "New@Example.com" });

    expect(res.status).toBe("created");

    const rows = await test_db.current!.db.select().from(user_table);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.email).toBe("new@example.com");
    expect(rows[0]!.emailVerified).toBe(false);

    // password-less: no credential account row
    const accounts = await test_db.current!.db.select().from(account);
    expect(accounts).toHaveLength(0);
  });

  it("reuses the unverified user when the same email is submitted twice", async () => {
    const first = await create_unverified_user({ email: "lead@example.com" });
    const second = await create_unverified_user({ email: "LEAD@example.com" });

    expect(first.status).toBe("created");
    expect(second.status).toBe("existing");
    expect(second).toMatchObject({ user_id: (first as any).user_id });

    const rows = await test_db.current!.db.select().from(user_table);
    expect(rows).toHaveLength(1);
  });

  it("fills in the names an address-only lead row never got", async () => {
    const first = await create_unverified_user({ email: "lead@example.com" });
    const second = await create_unverified_user({
      email: "lead@example.com",
      first_name: "Jane",
      last_name: "Doe",
    });

    expect(second.status).toBe("existing");

    const [row] = await test_db.current!.db.select().from(user_table);
    expect(row!.id).toBe((first as any).user_id);
    expect(row!.first_name).toBe("Jane");
    expect(row!.last_name).toBe("Doe");
    expect(row!.name).toBe("Jane Doe");
  });

  it("never overwrites a name the row already carries", async () => {
    await create_unverified_user({
      email: "lead@example.com",
      first_name: "Jane",
      last_name: "Doe",
    });
    await create_unverified_user({
      email: "lead@example.com",
      first_name: "Imposter",
      last_name: "Nobody",
    });

    const [row] = await test_db.current!.db.select().from(user_table);
    expect(row!.first_name).toBe("Jane");
    expect(row!.last_name).toBe("Doe");
    expect(row!.name).toBe("Jane Doe");
  });

  it("creates nothing when a verified user already owns the email", async () => {
    await test_auth_ref.current.api.signUpEmail({
      body: {
        email: "owner@example.com",
        password: "Test1234!@",
        name: "Real Owner",
        first_name: "Real",
        last_name: "Owner",
      },
    });
    await test_db
      .current!.db.update(user_table)
      .set({ emailVerified: true })
      .where(eq(user_table.email, "owner@example.com"));

    const before = await test_db.current!.db.select().from(user_table);

    const res = await create_unverified_user({ email: "owner@example.com" });

    expect(res.status).toBe("verified");
    // no user_id handed back — the caller must not be able to act as them
    expect(res).not.toHaveProperty("user_id");

    const after = await test_db.current!.db.select().from(user_table);
    expect(after).toHaveLength(before.length);
  });
});

describe("verification link", () => {
  /** ask for a link the way every surface does, and read the url out of the
   * mail the config just sent */
  async function request_link(email: string) {
    await test_auth_ref.current.api.signInMagicLink({
      body: { email },
      headers: new Headers(),
    });
    const last = sent_links.at(-1);
    if (!last) throw new Error(`no link mailed for ${email}`);
    return last.url;
  }

  const token_of = (url: string) =>
    new URL(url).searchParams.get("token") as string;

  it("mails a link, not a typed code", async () => {
    await create_unverified_user({ email: "lead@example.com" });
    const url = await request_link("lead@example.com");

    expect(url).toContain("/magic-link/verify");
    expect(token_of(url).length).toBeGreaterThan(20);
    // nothing a human is meant to retype
    expect(url).not.toMatch(/\b\d{6}\b/);
  });

  it("verifies the email and establishes a session when the link is used", async () => {
    const created = await create_unverified_user({ email: "lead@example.com" });
    const url = await request_link("lead@example.com");

    const res = await test_auth_ref.current.api.magicLinkVerify({
      query: { token: token_of(url) },
      headers: new Headers(),
    });

    expect(res.user.id).toBe((created as any).user_id);
    expect(res.user.emailVerified).toBe(true);
    expect(res.session.token).toBeTruthy();

    const [row] = await test_db.current!.db.select().from(user_table);
    expect(row!.emailVerified).toBe(true);
  });

  /** the fact the whole passwordless design is built on: better-auth's
   * `revokeUnprovenAccountAccess` runs before it flips `emailVerified`, so any
   * password set on a row that had not yet proven its address is deleted the
   * moment a link proves it. a library upgrade that changed this would silently
   * lock people out, so it is pinned here rather than assumed. */
  it("deletes a password set before the address was ever proven", async () => {
    await test_auth_ref.current.api.signUpEmail({
      body: {
        email: "lead@example.com",
        password: "Test1234!@",
        name: "Lead Person",
        first_name: "Lead",
        last_name: "Person",
      },
    });

    const before = await test_db.current!.db.select().from(account);
    expect(before.filter((a) => a.providerId === "credential")).toHaveLength(1);

    const url = await request_link("lead@example.com");
    await test_auth_ref.current.api.magicLinkVerify({
      query: { token: token_of(url) },
      headers: new Headers(),
    });

    const after = await test_db.current!.db.select().from(account);
    expect(after.filter((a) => a.providerId === "credential")).toHaveLength(0);

    const [row] = await test_db.current!.db.select().from(user_table);
    expect(row!.emailVerified).toBe(true);
  });

  it("refuses a link that was already consumed", async () => {
    await create_unverified_user({ email: "lead@example.com" });
    const token = token_of(await request_link("lead@example.com"));

    await test_auth_ref.current.api.magicLinkVerify({
      query: { token },
      headers: new Headers(),
    });

    await expect(
      test_auth_ref.current.api.magicLinkVerify({
        query: { token },
        headers: new Headers(),
      })
    ).rejects.toThrow();
  });

  it("refuses a link whose ttl has passed", async () => {
    await create_unverified_user({ email: "lead@example.com" });
    const token = token_of(await request_link("lead@example.com"));

    // age the stored row past LOGIN_LINK_TTL_S rather than sleeping
    await test_db
      .current!.db.update(verification)
      .set({ expiresAt: new Date(Date.now() - 1000) });

    await expect(
      test_auth_ref.current.api.magicLinkVerify({
        query: { token },
        headers: new Headers(),
      })
    ).rejects.toThrow();

    const [row] = await test_db.current!.db.select().from(user_table);
    expect(row!.emailVerified).toBe(false);
  });

  it("is harmless when the user is already verified", async () => {
    await create_unverified_user({ email: "lead@example.com" });
    const first = token_of(await request_link("lead@example.com"));
    await test_auth_ref.current.api.magicLinkVerify({
      query: { token: first },
      headers: new Headers(),
    });

    // a second, freshly requested link still just signs them in
    const second = token_of(await request_link("lead@example.com"));
    const res = await test_auth_ref.current.api.magicLinkVerify({
      query: { token: second },
      headers: new Headers(),
    });

    expect(res.user.emailVerified).toBe(true);
    const rows = await test_db.current!.db.select().from(user_table);
    expect(rows).toHaveLength(1);
  });
});

describe("account creation throttling", () => {
  const from_ip = (ip: string) => new Headers({ "x-forwarded-for": ip });

  beforeEach(() => {
    reset_rate_limits();
  });

  it("stops one source opening accounts for many addresses", async () => {
    const headers = from_ip("203.0.113.20");

    for (let i = 0; i < CREATE_PER_IP.max; i++) {
      const res = await create_unverified_user({
        email: `new${i}@example.com`,
        headers,
      });
      expect(res.status).toBe("created");
    }

    const over = await create_unverified_user({
      email: `new${CREATE_PER_IP.max}@example.com`,
      headers,
    });
    expect(over.status).toBe("throttled");
    // nothing to mint a draft grant from, so a refusal can never hand out
    // authority over an account it declined to create
    expect(over).not.toHaveProperty("user_id");

    const rows = await test_db.current!.db.select().from(user_table);
    expect(rows).toHaveLength(CREATE_PER_IP.max);
  });

  it("spends no quota on an address that already has a row", async () => {
    const headers = from_ip("203.0.113.21");
    await create_unverified_user({ email: "lead@example.com", headers });

    for (let i = 0; i < 20; i++) {
      const res = await create_unverified_user({
        email: "lead@example.com",
        headers,
      });
      expect(res.status).toBe("existing");
    }

    // resubmitting costs no row, so it must cost no quota either — this source
    // has written one row and is nowhere near its limit
    const fresh = await create_unverified_user({
      email: "fresh@example.com",
      headers,
    });
    expect(fresh.status).toBe("created");
  });

  it("does not let a spent source block a different one", async () => {
    for (let i = 0; i < CREATE_PER_IP.max; i++) {
      await create_unverified_user({
        email: `new${i}@example.com`,
        headers: from_ip("203.0.113.20"),
      });
    }

    const other = await create_unverified_user({
      email: "elsewhere@example.com",
      headers: from_ip("198.51.100.4"),
    });
    expect(other.status).toBe("created");
  });
});

describe("login link throttling", () => {
  const from_ip = (ip: string) => new Headers({ "x-forwarded-for": ip });

  beforeEach(() => {
    reset_rate_limits();
  });

  it("stops mailing one address once its quota is spent", async () => {
    await create_unverified_user({ email: "lead@example.com" });

    for (let i = 0; i < LINK_PER_EMAIL.max; i++) {
      await request_login_link({
        email: "lead@example.com",
        headers: from_ip("203.0.113.7"),
      });
    }
    expect(sent_links).toHaveLength(LINK_PER_EMAIL.max);

    // a different source does not reset an address that has had its share
    await request_login_link({
      email: "lead@example.com",
      headers: from_ip("198.51.100.4"),
    });
    expect(sent_links).toHaveLength(LINK_PER_EMAIL.max);
  });

  it("stops one source harvesting links across many addresses", async () => {
    for (let i = 0; i <= LINK_PER_IP.max; i++) {
      const email = `lead${i}@example.com`;
      await create_unverified_user({ email });
      await request_login_link({ email, headers: from_ip("203.0.113.9") });
    }
    // each address is well inside its own quota — the ip is what runs out
    expect(sent_links).toHaveLength(LINK_PER_IP.max);

    await request_login_link({
      email: `lead${LINK_PER_IP.max}@example.com`,
      headers: from_ip("198.51.100.4"),
    });
    expect(sent_links).toHaveLength(LINK_PER_IP.max + 1);
  });
});

/** vitest runs in a real browser, where `Cookie` is a forbidden header on
 * `Request` and is silently dropped. a bare `Headers` carries no such guard,
 * and `get_registrant` only ever reads `request.headers`. */
const req_with_cookie = (cookie: string) => {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return { headers } as unknown as Request;
};

describe("pre-verification authority", () => {
  /** a request carrying only the draft grant — no session cookie */
  async function grant_req(user_id: string) {
    return req_with_cookie((await issue_draft_grant(user_id)).split(";")[0]!);
  }

  it("does not let a draft grant pass as a session", async () => {
    const created = await create_unverified_user({ email: "lead@example.com" });
    const req = await grant_req((created as any).user_id);

    // this is what every authenticated surface calls — it must stay blind to
    // the grant, or opening the registration step opens the whole app
    const session = await test_auth_ref.current.api.getSession({
      headers: req.headers,
    });
    expect(session).toBeNull();
  });

  it("lets the draft grant fill the registration step it created", async () => {
    const created = await create_unverified_user({ email: "lead@example.com" });
    const req = await grant_req((created as any).user_id);

    const registrant = await get_registrant(req);
    expect(registrant?.id).toBe((created as any).user_id);
    expect(registrant?.email).toBe("lead@example.com");
  });

  it("refuses a grant naming an account that is already verified", async () => {
    const created = await create_unverified_user({ email: "lead@example.com" });
    const user_id = (created as any).user_id;
    const req = await grant_req(user_id);

    await test_db
      .current!.db.update(user_table)
      .set({ emailVerified: true })
      .where(eq(user_table.id, user_id));

    expect(await get_registrant(req)).toBeNull();
  });

  it("refuses a forged grant", async () => {
    const created = await create_unverified_user({ email: "lead@example.com" });

    // same payload, no signature
    const forged = req_with_cookie(
      `bg-draft=${btoa(JSON.stringify({ user_id: (created as any).user_id }))}`
    );

    expect(await get_registrant(forged)).toBeNull();
  });

  it("still refuses an unknown registrant with no grant at all", async () => {
    const bare = req_with_cookie("");
    expect(await get_registrant(bare)).toBeNull();
  });
});
