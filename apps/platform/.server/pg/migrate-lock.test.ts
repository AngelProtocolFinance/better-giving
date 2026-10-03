// pglite is one in-process session, so a second connection blocking on the
// lock can't be staged here; these pin the ordering contract with a fake.
import { describe, expect, test } from "vitest";
import {
  is_pooled_url,
  type LockClient,
  with_advisory_lock,
} from "./migrate-lock.ts";

function fake_client(fail_on?: RegExp) {
  const log: string[] = [];
  const client: LockClient = {
    async query(sql, params) {
      log.push(`${sql} ${params.join(",")}`);
      if (fail_on?.test(sql)) throw new Error(`refused: ${sql}`);
    },
  };
  return { client, log };
}

const LOCK = "select pg_advisory_lock($1::bigint) 42";
const UNLOCK = "select pg_advisory_unlock($1::bigint) 42";

describe("with_advisory_lock", () => {
  test("locks, runs the work, unlocks, and returns its result", async () => {
    const { client, log } = fake_client();
    const out = await with_advisory_lock(client, "42", async () => {
      log.push("work");
      return 0;
    });
    expect(out).toBe(0);
    expect(log).toEqual([LOCK, "work", UNLOCK]);
  });

  test("unlocks and rethrows when the work throws", async () => {
    const { client, log } = fake_client();
    const run = with_advisory_lock(client, "42", async () => {
      log.push("work");
      throw new Error("migration failed");
    });
    await expect(run).rejects.toThrow("migration failed");
    expect(log).toEqual([LOCK, "work", UNLOCK]);
  });

  test("never runs the work when the lock isn't taken", async () => {
    const { client, log } = fake_client(/pg_advisory_lock/);
    const run = with_advisory_lock(client, "42", async () => {
      log.push("work");
    });
    await expect(run).rejects.toThrow("refused");
    expect(log).toEqual([LOCK]);
  });

  test("a failed unlock doesn't mask the work's result", async () => {
    const { client } = fake_client(/pg_advisory_unlock/);
    await expect(with_advisory_lock(client, "42", async () => 3)).resolves.toBe(
      3
    );
  });
});

describe("is_pooled_url", () => {
  test("flags neon's -pooler host, where a session lock would leak onto a pooled backend", () => {
    expect(
      is_pooled_url(
        "postgresql://u:p@ep-cool-name-a1b2c3-pooler.us-east-2.aws.neon.tech/db?sslmode=require"
      )
    ).toBe(true);
  });

  test("passes the direct host", () => {
    expect(
      is_pooled_url(
        "postgresql://u:p@ep-cool-name-a1b2c3.us-east-2.aws.neon.tech/db?sslmode=require"
      )
    ).toBe(false);
    expect(is_pooled_url("postgres://u:p@localhost:5432/db")).toBe(false);
  });
});
