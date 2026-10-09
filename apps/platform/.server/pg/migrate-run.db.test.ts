// opt-in: pglite is one in-process session, so two sessions queueing on the
// lock needs a real server. point TEST_DATABASE_URL_UNPOOLED at a throwaway
// neon branch's direct endpoint; skipped without it.
import { Client, neonConfig } from "@neondatabase/serverless";
import { afterEach, describe, expect, test } from "vitest";
import ws from "ws";
import { MIGRATE_LOCK_KEY, with_advisory_lock } from "./migrate-lock.ts";
import { run_migrate } from "./migrate-run.ts";

const url = process.env.TEST_DATABASE_URL_UNPOOLED;
neonConfig.webSocketConstructor = ws;

const open: Client[] = [];
async function session() {
  const client = new Client(url);
  open.push(client);
  await client.connect();
  return client;
}
const pid = async (c: Client) =>
  (await c.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]
    .pid;

afterEach(async () => {
  await Promise.all(open.splice(0).map((c) => c.end().catch(() => {})));
});

/** holds the migration lock on its own session until `release()` */
async function hold_lock() {
  const holder = await session();
  let release_lock = () => {};
  const released = new Promise<void>((r) => {
    release_lock = r;
  });
  let unlocked = Promise.resolve();
  await new Promise<void>((held) => {
    unlocked = with_advisory_lock(holder, MIGRATE_LOCK_KEY, async () => {
      held();
      await released;
    });
  });
  const release = () => {
    release_lock();
    return unlocked;
  };
  return { holder, release };
}

describe.skipIf(!url)("the migration lock on a real server", () => {
  test("a second session queues until the first unlocks", async () => {
    const a = await hold_lock();
    const b = await session();
    let b_has_it = false;
    const b_lock = with_advisory_lock(b, MIGRATE_LOCK_KEY, async () => {
      b_has_it = true;
    });
    await new Promise((r) => setTimeout(r, 1_000));
    expect(b_has_it).toBe(false);
    await a.release();
    await b_lock;
    expect(b_has_it).toBe(true);
  });

  test("a run past its lock wait exits 1 naming the holder's pid", async () => {
    const a = await hold_lock();
    const lines: string[] = [];
    const code = await run_migrate({
      url,
      client: (u) => new Client(u),
      guard: () => [],
      apply: async () => {
        throw new Error("applied while another run held the lock");
      },
      lock_wait: "1s",
      log: { log: () => {}, error: (...a) => lines.push(a.join(" ")) },
    });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain(`pid ${await pid(a.holder)}`);
    await a.release();
  });

  test("applies on the session that holds the lock", async () => {
    let applied_on_holder = false;
    const code = await run_migrate({
      url,
      client: (u) => new Client(u),
      guard: () => [],
      apply: async (client) => {
        const { rows } = await client.query(
          `select 1 from pg_locks
            where locktype = 'advisory' and granted and pid = pg_backend_pid()`
        );
        applied_on_holder = rows.length === 1;
      },
      log: { log: () => {}, error: console.error },
    });
    expect(code).toBe(0);
    expect(applied_on_holder).toBe(true);
  });
});
