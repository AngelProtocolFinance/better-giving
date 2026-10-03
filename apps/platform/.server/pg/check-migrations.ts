/**
 * `pnpm migrate` runs this before `migrate.ts`, and a production `postbuild`
 * on its own, as plain `node` (type stripping, no loader) — so erasable TS
 * only, and no import that needs vite. Non-zero exit stops the build or the
 * release step before anything touches the database.
 *
 *   node .server/pg/check-migrations.ts [migrations dir]
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { check_journal, check_migration } from "./migration-guard.ts";

const dir = process.argv[2] ?? join(import.meta.dirname, "migrations");

const journal: { entries: { idx: number; when: number; tag: string }[] } =
  JSON.parse(readFileSync(join(dir, "meta", "_journal.json"), "utf8"));
const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));

const errors = [
  ...check_journal(journal.entries, files),
  ...files.flatMap((f) =>
    check_migration(f, readFileSync(join(dir, f), "utf8"))
  ),
];

if (errors.length > 0) {
  console.error(
    `migration guard: ${errors.length} problem(s) in ${dir}; not migrating\n${errors.join("\n")}`
  );
  process.exit(1);
}
