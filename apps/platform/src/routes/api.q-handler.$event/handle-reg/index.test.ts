import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TestDb } from "$/pg/test-utils/pglite-browser";

// --- hoisted refs ---

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const test_auth_ref = vi.hoisted(() => ({ current: null as any }));
const send_email = vi.hoisted(() =>
  vi.fn(async (_i: { node: any; to: string[]; subject: string }) => ({
    data: { id: "email-1", response: "250 ok" },
    error: null,
  }))
);
const enqueued = vi.hoisted(() => [] as { id: string; payload: any }[]);

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
  send_email,
  sender: "test <test@test.com>",
}));

// the verified/unverified read is the whole subject here, so it runs against a
// real better-auth instance — only the one beneath it is swapped for pglite.
vi.mock("#/.server/auth/auth", () => ({
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

// the wizard case is driven through the real producer, so the flag's wiring is
// under test and not just the handler's branch. the queue is the seam between
// them — nothing else here needs qstash.
vi.mock("$/kit/queue", () => ({
  enqueue: vi.fn(async (...msgs: { id: string; payload: any }[]) => {
    enqueued.push(...msgs);
  }),
}));

vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock({ session: true })
);

vi.mock("#/.server/cookie", () => ({
  reg_cookie: {
    parse: vi.fn(async () => ({})),
    serialize: vi.fn(async () => "bg-registration=x"),
  },
}));

// --- imports (after mocks) ---

import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { eq } from "drizzle-orm";
import { createFormData } from "remix-hook-form";
import { get_session } from "#/.server/auth";
import { auth_options, login_link_plugin } from "#/.server/auth/options";
import { create_unverified_user } from "#/.server/auth/unverified-user";
import { referral_id } from "#/helpers/referral";
import { new_application } from "#/pages/registration/new-application";
import * as schema from "$/pg/schema";
import {
  account,
  session,
  user as user_table,
  verification,
} from "$/pg/schema/auth";
import { create_test_db } from "$/pg/test-utils/pglite-browser";
import { handle_reg_created } from ".";

const BASE_URL = "http://localhost:4200";
const TEST_SECRET = "test-secret-at-least-32-characters-long!!";

beforeAll(async () => {
  test_db.current = await create_test_db();

  const deps = {
    referral_id,
    send_login_link: async () => {},
  };

  test_auth_ref.current = betterAuth({
    ...auth_options(deps),
    plugins: [login_link_plugin(deps)],
    secret: TEST_SECRET,
    baseURL: BASE_URL,
    basePath: "/api/auth",
    database: drizzleAdapter(test_db.current.db, { provider: "pg", schema }),
  });
}, 30_000);

beforeEach(async () => {
  vi.clearAllMocks();
  enqueued.length = 0;
  const db = test_db.current!.db;
  await db.delete(verification);
  await db.delete(session);
  await db.delete(account);
  await db.delete(user_table);
});

/** an address whose owner already proved it and holds a real account */
async function verified(email: string) {
  const created = await create_unverified_user({ email });
  await test_db
    .current!.db.update(user_table)
    .set({ emailVerified: true })
    .where(eq(user_table.email, email));
  return (created as any).user_id as string;
}

describe("handle_reg_created", () => {
  it("does not mail a verified account a registration it never started", async () => {
    await verified("owner@example.org");

    await handle_reg_created({
      id: "reg-1",
      r_id: "owner@example.org",
      unproven: true,
    });

    expect(send_email).not.toHaveBeenCalled();
  });

  it("mails the registrant whose address is not yet proven", async () => {
    await create_unverified_user({ email: "lead@example.org" });

    await handle_reg_created({
      id: "reg-2",
      r_id: "lead@example.org",
      unproven: true,
    });

    expect(send_email).toHaveBeenCalledOnce();
    expect(send_email.mock.calls[0]![0]).toMatchObject({
      to: ["lead@example.org"],
    });
  });

  it("mails when the address has no account at all", async () => {
    await handle_reg_created({
      id: "reg-3",
      r_id: "nobody@example.org",
      unproven: true,
    });

    expect(send_email).toHaveBeenCalledOnce();
  });

  it("mails on a message enqueued before the flag existed", async () => {
    // in-flight messages from the previous deploy carry no `unproven`, and the
    // absent field has to mean the behavior they were enqueued under.
    await verified("owner@example.org");

    await handle_reg_created({ id: "reg-4", r_id: "owner@example.org" });

    expect(send_email).toHaveBeenCalledOnce();
  });

  it("mails the verified applicant who started it from the wizard", async () => {
    // the reference id in this mail is what `resume_application` takes, and
    // every wizard applicant is signed in — so verified.
    await verified("founder@example.org");
    vi.mocked(get_session).mockResolvedValue({
      user: { id: "u1", email: "founder@example.org", emailVerified: true },
    } as any);

    const res = await new_application(
      new Request("https://bg.test/register", { method: "POST" }),
      createFormData({ o_type: "501c3", o_ein: "12-3456789" })
    );
    expect((res as Response).headers.get("location")).toMatch(/^\/register\//);

    const m = enqueued.find((x) => x.id === "reg-created");
    expect(m?.payload.unproven).toBe(false);

    await handle_reg_created(m!.payload);

    expect(send_email).toHaveBeenCalledOnce();
    expect(send_email.mock.calls[0]![0]).toMatchObject({
      to: ["founder@example.org"],
    });
  });
});
