/**
 * `drizzle-kit migrate` under a postgres advisory lock, so runs against one
 * database — concurrent builds of a commit, the production release step in
 * `.github/workflows/smoke.yml` — apply one at a time and the later ones find
 * nothing pending. plain `node` like `check-migrations.ts`: erasable TS only.
 *
 *   node --env-file-if-exists=.env .server/pg/migrate.ts
 *
 * the lock lives on its own session while drizzle-kit migrates on another, so
 * the url must be the direct (unpooled) endpoint — see `is_pooled_url`.
 * drizzle-kit takes no lock of its own, and the holder's session sits idle
 * holding only the advisory lock, so the two connections can't deadlock.
 *
 * if the holder's socket drops, postgres frees the lock and the next waiter
 * starts while this drizzle-kit may still be mid-transaction; drizzle reads its
 * last-applied row outside that transaction, so the waiter would re-apply the
 * same files. so a lost session kills the child, whose single transaction then
 * rolls back with its connection. a drop the client never hears about (no
 * socket error) isn't covered.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { constants } from "node:os";
import { join } from "node:path";
import { Client, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import {
  is_pooled_url,
  MIGRATE_LOCK_KEY,
  with_advisory_lock,
} from "./migrate-lock.ts";

const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) {
  console.error("migrate: DATABASE_URL_UNPOOLED is unset; not migrating");
  process.exit(1);
}
if (is_pooled_url(url)) {
  console.error(
    "migrate: DATABASE_URL_UNPOOLED is a -pooler host; not migrating"
  );
  process.exit(1);
}

const drizzle_kit = join(
  import.meta.dirname,
  "../../node_modules/.bin/drizzle-kit"
);

let child: ChildProcess | undefined;

/** exit code of `drizzle-kit migrate`, pinned to the url the lock is on */
const drizzle_kit_migrate = () =>
  new Promise<number>((resolve, reject) => {
    child = spawn(drizzle_kit, ["migrate"], {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL_UNPOOLED: url },
    })
      .on("error", reject)
      // a signal-killed child has no code; fail closed
      .on("exit", (code) => resolve(code ?? 1));
  });

// a handler replaces node's exit-on-signal: while drizzle-kit runs, let it
// stop (rolling back) and exit through the unlock below; before, just exit
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    const running = child?.exitCode === null && child.signalCode === null;
    if (running) child?.kill(signal);
    else process.exit(128 + constants.signals[signal]);
  });
}

// node 24 has a global WebSocket the driver would find; explicit is inert
neonConfig.webSocketConstructor = ws;
const client = new Client(url);
let session_lost = false;
// unhandled, this 'error' crashes the process and orphans drizzle-kit
client.on("error", (err) => {
  session_lost = true;
  console.error("migrate: lock session lost, stopping drizzle-kit:", err);
  child?.kill("SIGTERM");
});
await client.connect();
console.log("migrate: waiting for the migration lock");
const code = await with_advisory_lock(client, MIGRATE_LOCK_KEY, () => {
  console.log("migrate: lock held, running drizzle-kit migrate");
  return drizzle_kit_migrate();
}).finally(() => (session_lost ? undefined : client.end()));
process.exit(code);
