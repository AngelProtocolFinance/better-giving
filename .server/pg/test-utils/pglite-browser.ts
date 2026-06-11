import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../schema";

// vite inlines .sql files at build time — no node:fs needed
const migrations = import.meta.glob("../migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export async function create_test_db() {
  const client = new PGlite({ extensions: { pg_trgm } });
  await client.exec("CREATE EXTENSION IF NOT EXISTS pg_trgm");

  // apply all migrations in order
  const files = Object.keys(migrations).sort();

  for (const file of files) {
    const sql = migrations[file];
    // drizzle-kit uses `--> statement-breakpoint` as separator
    for (const stmt of sql.split("--> statement-breakpoint")) {
      const trimmed = stmt.trim();
      if (!trimmed) continue;
      try {
        await client.exec(trimmed);
      } catch (e: any) {
        // skip statements that need extensions pglite doesn't have (e.g. pg_trgm)
        if (e.message?.includes("does not exist")) continue;
        throw e;
      }
    }
  }

  const db = drizzle(client, { schema });
  return { db, client };
}

export type TestDb = Awaited<ReturnType<typeof create_test_db>>;
