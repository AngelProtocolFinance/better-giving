/**
 * `migrate.ts` runs `migration_guard_errors` before it takes the lock; a
 * production `postbuild` runs this file on its own, to fail the build early.
 * Both are plain `node` (type stripping, no loader) — so erasable TS only, and
 * no import that needs vite. Non-zero exit stops the build or the release step
 * before anything touches the database.
 *
 *   node .server/pg/check-migrations.ts [migrations dir]
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { check_journal, check_migration } from "./migration-guard.ts";

export const MIGRATIONS_DIR = join(import.meta.dirname, "migrations");

/** every guard problem in `dir`'s `.sql` files and journal; empty passes */
export function migration_guard_errors(dir = MIGRATIONS_DIR): string[] {
  const journal: { entries: { idx: number; when: number; tag: string }[] } =
    JSON.parse(readFileSync(join(dir, "meta", "_journal.json"), "utf8"));
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
  return [
    ...check_journal(journal.entries, files),
    ...files.flatMap((f) =>
      check_migration(f, readFileSync(join(dir, f), "utf8"))
    ),
  ];
}

const is_entry =
  !!process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (is_entry) {
  const dir = process.argv[2] ?? MIGRATIONS_DIR;
  const errors = migration_guard_errors(dir);
  if (errors.length > 0) {
    console.error(
      `migration guard: ${errors.length} problem(s) in ${dir}; not migrating\n${errors.join("\n")}`
    );
    process.exit(1);
  }
}
