import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TestDb } from "$/pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const test_auth_ref = vi.hoisted(() => ({ current: null as any }));
/** every login link the config mails */
const sent_links = vi.hoisted(() => [] as { email: string; url: string }[]);

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

vi.mock("#/errors/report", () => ({ report_error: vi.fn() }));

import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { while_token_writes_fail } from "#/__tests__/fixtures/token-writes";
import { referral_id } from "#/helpers/referral";
import * as schema from "$/pg/schema";
import { create_test_db } from "$/pg/test-utils/pglite";
import {
  check_email_url,
  LINK_PER_EMAIL,
  LINK_PER_IP,
  request_login_link,
} from "./login-link";
import { auth_options, login_link_plugin } from "./options";
import { reset_rate_limits } from "./rate-limit";

const ORIGIN = "http://localhost:4200";

beforeAll(async () => {
  test_db.current = await create_test_db();
  const deps = {
    referral_id,
    send_login_link: async (a: { email: string; url: string }) => {
      sent_links.push(a);
    },
  };
  test_auth_ref.current = betterAuth({
    ...auth_options(deps),
    secret: "test-secret-at-least-32-characters-long!!",
    baseURL: ORIGIN,
    basePath: "/api/auth",
    database: drizzleAdapter(test_db.current.db, { provider: "pg", schema }),
    plugins: [login_link_plugin(deps)],
  });
});

beforeEach(() => {
  reset_rate_limits();
  sent_links.length = 0;
});

const from_ip = (ip: string) => new Headers({ "x-forwarded-for": ip });

describe("request_login_link", () => {
  it("lands an off-site redirect_to back on this origin", async () => {
    await request_login_link({
      email: "donor@example.com",
      redirect_to: "https://evil.example/phish",
      headers: from_ip("203.0.113.7"),
    });

    expect(sent_links).toHaveLength(1);
    const link = new URL(sent_links[0]!.url);
    expect(link.searchParams.get("callbackURL")).toBe("/marketplace");
    const on_error = new URL(
      link.searchParams.get("errorCallbackURL")!,
      ORIGIN
    );
    expect(on_error.origin).toBe(ORIGIN);
    expect(on_error.searchParams.get("redirect")).toBe("/marketplace");
  });

  it("carries an on-site redirect_to into the link", async () => {
    await request_login_link({
      email: "donor@example.com",
      redirect_to: "/donate/1",
      headers: from_ip("203.0.113.7"),
    });

    expect(sent_links).toHaveLength(1);
    const link = new URL(sent_links[0]!.url);
    expect(link.searchParams.get("callbackURL")).toBe("/donate/1");
    const on_error = new URL(
      link.searchParams.get("errorCallbackURL")!,
      ORIGIN
    );
    expect(on_error.searchParams.get("redirect")).toBe("/donate/1");
  });

  it("stops mailing one address once its quota is spent, whatever its spelling", async () => {
    for (let i = 0; i < LINK_PER_EMAIL.max; i++) {
      await request_login_link({
        email: "victim@example.com",
        headers: from_ip("203.0.113.7"),
      });
    }
    expect(sent_links).toHaveLength(LINK_PER_EMAIL.max);

    await request_login_link({
      email: " Victim@Example.com ",
      headers: from_ip("198.51.100.4"),
    });
    expect(sent_links).toHaveLength(LINK_PER_EMAIL.max);
  });

  it("never charges an address for a source already over its cap", async () => {
    const victim = "victim@example.com";
    for (let i = 0; i < LINK_PER_IP.max; i++) {
      await request_login_link({
        email: `donor${i}@example.com`,
        headers: from_ip("203.0.113.9"),
      });
    }
    for (let i = 0; i < LINK_PER_EMAIL.max; i++) {
      await request_login_link({
        email: victim,
        headers: from_ip("203.0.113.9"),
      });
    }
    expect(sent_links).toHaveLength(LINK_PER_IP.max);

    // the victim's own quota is whole
    sent_links.length = 0;
    for (let i = 0; i < LINK_PER_EMAIL.max; i++) {
      await request_login_link({
        email: victim,
        headers: from_ip("198.51.100.4"),
      });
    }
    expect(sent_links).toHaveLength(LINK_PER_EMAIL.max);
  });

  it("hands the source back a request the address refused", async () => {
    // spends the address, then asks past it until the source's cap is covered
    for (let i = 0; i < LINK_PER_IP.max; i++) {
      await request_login_link({
        email: "victim@example.com",
        headers: from_ip("203.0.113.9"),
      });
    }
    expect(sent_links).toHaveLength(LINK_PER_EMAIL.max);

    for (let i = 0; i < LINK_PER_IP.max - LINK_PER_EMAIL.max; i++) {
      await request_login_link({
        email: `donor${i}@example.com`,
        headers: from_ip("203.0.113.9"),
      });
    }
    expect(sent_links).toHaveLength(LINK_PER_IP.max);
  });

  it("hands an address back a send the adapter failed, but the source still pays", async () => {
    await while_token_writes_fail(test_db.current!, async () => {
      for (let i = 0; i < LINK_PER_IP.max; i++) {
        await request_login_link({
          email: "victim@example.com",
          headers: from_ip("203.0.113.9"),
        });
      }
    });
    expect(sent_links).toHaveLength(0);

    // a failed send still cost the source
    await request_login_link({
      email: "donor@example.com",
      headers: from_ip("203.0.113.9"),
    });
    expect(sent_links).toHaveLength(0);

    await request_login_link({
      email: "victim@example.com",
      headers: from_ip("198.51.100.4"),
    });
    expect(sent_links).toHaveLength(1);
  });
});

describe("check_email_url", () => {
  it("keeps an on-site redirect and drops an off-site one", () => {
    const on_site = check_email_url({
      email: "d@x.org",
      redirect_to: "/donate/1",
    });
    expect(new URL(on_site, ORIGIN).searchParams.get("redirect")).toBe(
      "/donate/1"
    );

    const off_site = check_email_url({
      email: "d@x.org",
      redirect_to: "//evil.example",
    });
    expect(new URL(off_site, ORIGIN).searchParams.has("redirect")).toBe(false);
  });
});
