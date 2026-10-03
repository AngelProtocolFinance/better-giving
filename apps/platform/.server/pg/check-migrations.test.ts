import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { migration_guard_errors } from "./check-migrations.ts";

const script = join(import.meta.dirname, "check-migrations.ts");

/** runs the preflight the way `postbuild` does: plain node, no loader */
const preflight = (...args: string[]) =>
  spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

/** a migrations dir past the grandfathered 0000–0045, journal in step */
function migrations_dir(...pending: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "migrations-"));
  mkdirSync(join(dir, "meta"));
  const sqls = [...Array<string>(46).fill("SELECT 1;"), ...pending];
  const tags = sqls.map((_, idx) => `${String(idx).padStart(4, "0")}_m`);
  const entries = tags.map((tag, idx) => ({
    idx,
    version: "7",
    when: 1_000 + idx,
    tag,
    breakpoints: true,
  }));
  writeFileSync(
    join(dir, "meta", "_journal.json"),
    JSON.stringify({ version: "7", dialect: "postgresql", entries })
  );
  for (const [i, sql] of sqls.entries()) {
    writeFileSync(join(dir, `${tags[i]}.sql`), sql);
  }
  return dir;
}

describe("the migration preflight", () => {
  test("passes the committed migrations", () => {
    const run = preflight();
    expect(run.status, run.stderr).toBe(0);
  });

  test("exits non-zero on an unmarked destructive migration, printing it", () => {
    const dir = migrations_dir('ALTER TABLE "npos" DROP COLUMN "claimed";');
    const run = preflight(dir);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("0046_m.sql: drop column");
  });

  test("exits non-zero on a broken journal", () => {
    const dir = migrations_dir();
    writeFileSync(join(dir, "0046_orphan.sql"), "SELECT 1;");
    const run = preflight(dir);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("0046_orphan.sql");
  });
});

describe("migration_guard_errors", () => {
  test("is importable without running the cli, and returns the problems", () => {
    expect(migration_guard_errors()).toEqual([]);
    const dir = migrations_dir('ALTER TABLE "npos" DROP COLUMN "claimed";');
    expect(migration_guard_errors(dir).join("\n")).toContain(
      "0046_m.sql: drop column"
    );
  });
});
