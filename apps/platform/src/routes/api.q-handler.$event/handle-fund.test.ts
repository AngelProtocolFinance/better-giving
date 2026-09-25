import type { ReactElement } from "react";
import { render } from "react-email";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { seed_fund, seed_npo, seed_user } from "#/__tests__/fixtures/funds";
import type { IFundMemberRemovedPayload } from "@/queue";
import { user } from "$/pg/schema/auth";
import { fund_members, funds } from "$/pg/schema/fund";
import { npos } from "$/pg/schema/npo";
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

// smtp and error reporting are the fakes: the creator lookup runs against real postgres.
const send_email_or_throw = vi.hoisted(() =>
  vi.fn(async (_i: { node: ReactElement; to: string[]; subject: string }) => ({
    id: "email-1",
    response: "250 ok",
  }))
);
vi.mock("$/email", () => ({ send_email_or_throw }));

const report_error = vi.hoisted(() => vi.fn());
vi.mock("#/errors/report", () => ({ report_error }));

import { create_test_db } from "$/pg/test-utils/pglite";
import { handle_fund_member_removed } from "./handle-fund";

const db = () => test_db.current!.db;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await db().delete(fund_members);
  await db().delete(funds);
  await db().delete(npos);
  await db().delete(user);
});

/** the payload `fund_member_remove` enqueues: `creator_name` is the fund's name */
async function seed_opt_out(creator_id: string) {
  const npo = await seed_npo(db(), { name: "Save the Whales" });
  return {
    fund_id: "fund-1",
    creator_id,
    creator_name: "Ocean Fund",
    removed_npo_ids: [npo.id],
  } satisfies IFundMemberRemovedPayload;
}

describe("handle_fund_member_removed", () => {
  test("mails the fund creator at their address, greeted by their own name, naming the nonprofit", async () => {
    const creator = await seed_user(db(), "ada@test.com", "Ada", "Lovelace");
    await seed_fund(db(), {
      id: "fund-1",
      name: "Ocean Fund",
      npo_owner: null,
      creator_id: creator.id,
    });
    const payload = await seed_opt_out(creator.id);

    await handle_fund_member_removed(payload);

    expect(send_email_or_throw).toHaveBeenCalledOnce();
    const [{ node, to, subject }] = send_email_or_throw.mock.calls[0];
    expect(to).toEqual(["ada@test.com"]);
    expect(subject).toMatch(/Save the Whales/);
    const text = await render(node, { plainText: true });
    expect(text).toMatch(/Hello Ada,/);
    expect(text).toMatch(/Save the Whales has opted out of your fundraiser/);
  });

  test("greets a creator who has no first name as there", async () => {
    const creator = await seed_user(db(), "anon@test.com", "", "");
    const payload = await seed_opt_out(creator.id);

    await handle_fund_member_removed(payload);

    const [{ node }] = send_email_or_throw.mock.calls[0];
    const text = await render(node, { plainText: true });
    expect(text).toMatch(/Hello there,/);
  });

  test("a creator with no user row is reported, not mailed, and not retried", async () => {
    const payload = await seed_opt_out("gone-user-id");

    await expect(handle_fund_member_removed(payload)).resolves.toBeUndefined();

    expect(send_email_or_throw).not.toHaveBeenCalled();
    expect(report_error).toHaveBeenCalledOnce();
  });
});
