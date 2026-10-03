/**
 * the migration guard, then drizzle-orm's migrator under a postgres advisory
 * lock, so runs against one database — concurrent preview/staging builds, the
 * production release step in `.github/workflows/smoke.yml` — apply one at a
 * time and the later ones find nothing pending. plain `node` like
 * `check-migrations.ts`: erasable TS only.
 *
 *   node --env-file-if-exists=.env .server/pg/migrate.ts
 *
 * lock and migration share one session, so they end together: a dropped
 * socket or a killed process frees the lock and rolls back the open
 * transaction at once, and no waiter can start beside a migration still
 * running. the url must be the direct (unpooled) endpoint — see
 * `is_pooled_url`. no signal handler: node's default exit closes the socket,
 * which is the cleanup.
 *
 * drizzle-kit migrate called this same migrator with no `migrations` block in
 * `drizzle.config.ts`, so the defaults here (`drizzle.__drizzle_migrations`,
 * rows keyed on the journal's `when`) read the rows it already wrote.
 */
import { Client, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import ws from "ws";
import { MIGRATIONS_DIR, migration_guard_errors } from "./check-migrations.ts";
import { run_migrate } from "./migrate-run.ts";

// the constructor db.ts gives the app's pool, so migrations ride the same
// transport rather than whichever global WebSocket the node version ships
neonConfig.webSocketConstructor = ws;

function session(url: string) {
  const client = new Client(url);
  // a socket error also rejects the pending query, which ends the run;
  // unheard, it would crash the process before the exit code is set
  client.on("error", (err) => console.error("migrate: session lost:", err));
  return client;
}

process.exit(
  await run_migrate({
    url: process.env.DATABASE_URL_UNPOOLED,
    client: session,
    guard: migration_guard_errors,
    apply: (client) =>
      migrate(drizzle({ client }), {
        migrationsFolder: MIGRATIONS_DIR,
      }),
  })
);
