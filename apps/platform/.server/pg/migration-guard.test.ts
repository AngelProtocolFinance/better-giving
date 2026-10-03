import { describe, expect, test } from "vitest";
import { check_journal, check_migration } from "./migration-guard";
import journal from "./migrations/meta/_journal.json";

const migrations = import.meta.glob("./migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("the committed migrations", () => {
  test("hold no unacknowledged destructive statement", () => {
    const errors = Object.entries(migrations).flatMap(([file, sql]) =>
      check_migration(file, sql)
    );
    expect(errors).toEqual([]);
  });

  test("are listed in a journal drizzle-kit migrate applies in full", () => {
    const files = Object.keys(migrations).map((f) => f.split("/").pop()!);
    expect(files.length).toBeGreaterThan(45);
    expect(check_journal(journal.entries, files)).toEqual([]);
  });
});

const entry = (idx: number, when: number, tag: string) => ({ idx, when, tag });

describe("check_journal", () => {
  test("a journal whose when strictly increases with idx passes", () => {
    const entries = [entry(0, 100, "0000_a"), entry(1, 200, "0001_b")];
    expect(check_journal(entries, ["0000_a.sql", "0001_b.sql"])).toEqual([]);
  });

  test("a when no later than the entry before it fails, naming the tag", () => {
    const entries = [
      entry(0, 100, "0000_a"),
      entry(1, 300, "0001_b"),
      entry(2, 300, "0002_c"),
    ];
    const errors = check_journal(entries, [
      "0000_a.sql",
      "0001_b.sql",
      "0002_c.sql",
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("0002_c");
  });

  test("an entry whose idx is not its position fails", () => {
    const entries = [entry(0, 100, "0000_a"), entry(2, 200, "0002_c")];
    const [error] = check_journal(entries, ["0000_a.sql", "0002_c.sql"]);
    expect(error).toContain("0002_c");
  });

  test("a tag numbered other than its idx fails, so a new file can't pose as grandfathered", () => {
    const entries = [entry(0, 100, "0000_a"), entry(1, 200, "0012_x")];
    const errors = check_journal(entries, ["0000_a.sql", "0012_x.sql"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("0012_x");
  });

  test("a tag with no leading number fails", () => {
    const entries = [entry(0, 100, "init")];
    expect(check_journal(entries, ["init.sql"])).toHaveLength(1);
  });

  test("a tag without its .sql file fails", () => {
    const entries = [entry(0, 100, "0000_a"), entry(1, 200, "0001_b")];
    const errors = check_journal(entries, ["0000_a.sql"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("0001_b.sql");
  });

  test("a .sql file the journal does not list fails", () => {
    const entries = [entry(0, 100, "0000_a")];
    const errors = check_journal(entries, [
      "0000_a.sql",
      "0001_hand_written.sql",
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("0001_hand_written.sql");
  });
});

describe("check_migration", () => {
  test("an unmarked drop column fails, naming the file and the statement", () => {
    const errors = check_migration(
      "0046_drop_x.sql",
      'ALTER TABLE "npos" DROP COLUMN "claimed";'
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("0046_drop_x.sql");
    expect(errors[0]).toContain('ALTER TABLE "npos" DROP COLUMN "claimed"');
    expect(errors[0]).toContain(
      "-- contract: <sha> <what that release changed>"
    );
  });

  test.each([
    ["drop table", 'DROP TABLE "claims" CASCADE;'],
    ["drop column", 'ALTER TABLE "npos" DROP "claimed";'],
    ["drop column", 'ALTER TABLE "npos" DROP IF EXISTS "claimed";'],
    ["rename", 'ALTER TABLE "npos" RENAME COLUMN "claimed" TO "is_claimed";'],
    ["rename", 'ALTER TABLE "npos" RENAME TO "nonprofits";'],
    ["rename", "ALTER TYPE \"status\" RENAME VALUE 'a' TO 'b';"],
    [
      "alter column type",
      'ALTER TABLE "dists" ALTER COLUMN "n" SET DATA TYPE integer USING "n"::integer;',
    ],
    ["alter column type", 'ALTER TABLE "dists" ALTER "n" TYPE bigint;'],
    [
      "set not null",
      'ALTER TABLE "npos" ADD COLUMN "x" text, ALTER COLUMN "y" SET NOT NULL;',
    ],
    ["drop default", 'ALTER TABLE "npos" ALTER COLUMN "y" DROP DEFAULT;'],
    ["drop type", 'DROP TYPE "public"."status";'],
    ["drop view", 'DROP VIEW "public"."v_balances";'],
    ["drop view", 'DROP MATERIALIZED VIEW IF EXISTS "mv";'],
    ["drop schema", 'DROP SCHEMA "legacy";'],
    ["rename", 'ALTER TABLE "npos" SET SCHEMA "registry";'],
    ["rename", 'ALTER VIEW "public"."v" SET SCHEMA "reports";'],
    ["rename", 'ALTER MATERIALIZED VIEW "mv" SET SCHEMA "reports";'],
    ["rename", 'ALTER TYPE "public"."status" SET SCHEMA "registry";'],
    ["drop identity", 'ALTER TABLE "npos" ALTER COLUMN "id" DROP IDENTITY;'],
    [
      "drop identity",
      'ALTER TABLE "npos" ALTER COLUMN "id" DROP IDENTITY IF EXISTS;',
    ],
    [
      "set generated always",
      'ALTER TABLE "npos" ALTER COLUMN "id" SET GENERATED ALWAYS;',
    ],
  ])("an unmarked %s fails: %s", (kind, stmt) => {
    const [error] = check_migration("0046_x.sql", stmt);
    expect(error).toContain(kind);
  });

  test.each([
    'ALTER TABLE "npos" ADD COLUMN "tier" text NOT NULL;',
    'ALTER TABLE "npos" ADD "tier" text NOT NULL;',
    'ALTER TABLE "npos" ADD COLUMN "x" text DEFAULT \'a\', ADD COLUMN "tier" integer NOT NULL;',
  ])("a NOT NULL column added without a default fails: %s", (stmt) => {
    const errors = check_migration("0046_x.sql", stmt);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("add not null column without default");
  });

  test.each([
    'ALTER TABLE "npos" ADD COLUMN "tier" text DEFAULT \'basic\' NOT NULL;',
    'ALTER TABLE "npos" ADD COLUMN "tier" text NOT NULL DEFAULT \'basic\';',
    'ALTER TABLE "npos" ADD COLUMN "tier" text;',
    'ALTER TABLE "npos" ADD COLUMN "n" integer GENERATED ALWAYS AS IDENTITY NOT NULL;',
    'ALTER TABLE "npos" ADD CONSTRAINT "npos_t_nn" CHECK ("t" IS NOT NULL) NOT VALID;',
    'CREATE TABLE "tiers" ("id" text PRIMARY KEY NOT NULL, "name" text NOT NULL);',
    'ALTER TABLE "npos" ADD COLUMN "x" text CHECK ("x" IS NOT NULL OR "y" > 0);',
    'ALTER TABLE "npos" ADD COLUMN "n" serial NOT NULL;',
    'ALTER TABLE "npos" ADD COLUMN "n" bigserial NOT NULL;',
    'ALTER TABLE "npos" ADD COLUMN "n" smallserial NOT NULL;',
  ])("an added column old inserts can omit passes: %s", (stmt) => {
    expect(check_migration("0046_x.sql", stmt)).toEqual([]);
  });

  test("a migration numbered 0045 or below is grandfathered", () => {
    const sql = 'ALTER TABLE "npos" DROP COLUMN "claimed";';
    expect(check_migration("0038_drop_claim.sql", sql)).toEqual([]);
    expect(check_migration("../migrations/0045_x.sql", sql)).toEqual([]);
    expect(check_migration("../migrations/0046_x.sql", sql)).toHaveLength(1);
  });

  test("an additive migration passes", () => {
    const sql = [
      "CREATE TYPE \"public\".\"status\" AS ENUM('a', 'b');--> statement-breakpoint",
      'CREATE TABLE "things" ("id" text PRIMARY KEY NOT NULL, "type" text NOT NULL);--> statement-breakpoint',
      'ALTER TABLE "npos" ADD COLUMN "type" text DEFAULT \'x\' NOT NULL;--> statement-breakpoint',
      'ALTER TABLE "npos" ADD CONSTRAINT "npos_t_fk" FOREIGN KEY ("t") REFERENCES "things"("id") ON DELETE SET NULL;--> statement-breakpoint',
      'ALTER TABLE "npos" ALTER COLUMN "y" DROP NOT NULL;--> statement-breakpoint',
      'ALTER TABLE "npos" ALTER COLUMN "y" SET DEFAULT 0;--> statement-breakpoint',
      'ALTER TABLE "npos" ALTER COLUMN "id" SET GENERATED BY DEFAULT;--> statement-breakpoint',
      'ALTER TABLE "npos" DROP CONSTRAINT IF EXISTS "npos_old_check";--> statement-breakpoint',
      'ALTER TABLE "npos" RENAME CONSTRAINT "a" TO "b";--> statement-breakpoint',
      'ALTER INDEX "npos_a_idx" RENAME TO "npos_b_idx";--> statement-breakpoint',
      'ALTER TYPE "public"."status" ADD VALUE \'c\';--> statement-breakpoint',
      'DROP INDEX "npos_old_idx";--> statement-breakpoint',
      'CREATE INDEX "npos_type_idx" ON "npos" USING btree ("type");--> statement-breakpoint',
      'CREATE OR REPLACE VIEW "v" AS (SELECT 1);--> statement-breakpoint',
      "CREATE OR REPLACE FUNCTION f() RETURNS trigger AS $$ BEGIN DROP TABLE x; END; $$ LANGUAGE plpgsql;--> statement-breakpoint",
      'COMMENT ON COLUMN "npos"."type" IS \'replaces the column we will DROP COLUMN later\';',
    ].join("\n");
    expect(check_migration("0046_add.sql", sql)).toEqual([]);
  });

  test("a well-formed contract marker acknowledges the destructive statement", () => {
    const sql = [
      "-- contract: d7ef67b stopped reading npos.claimed in the claim flow",
      'ALTER TABLE "npos" DROP COLUMN "claimed";',
    ].join("\n");
    expect(check_migration("0046_drop_claimed.sql", sql)).toEqual([]);
  });

  test("a marker waives only the statement right after it", () => {
    const sql = [
      "-- contract: d7ef67b stopped reading npos.claimed",
      'ALTER TABLE "npos" DROP COLUMN "claimed";--> statement-breakpoint',
      'ALTER TABLE "dists" DROP COLUMN "legacy";',
    ].join("\n");
    const errors = check_migration("0046_x.sql", sql);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"dists" DROP COLUMN "legacy"');
  });

  test("comment lines may sit between a marker and its statement", () => {
    const sql = [
      'ALTER TABLE "npos" ADD COLUMN "x" text;--> statement-breakpoint',
      "-- contract: d7ef67b stopped reading npos.claimed",
      "-- dropped after the claim flow moved to claims",
      "/* block too */",
      'ALTER TABLE "npos" DROP COLUMN "claimed";',
    ].join("\n");
    expect(check_migration("0046_x.sql", sql)).toEqual([]);
  });

  test.each([
    [
      "trailing a line of code",
      'SELECT 1; -- contract: d7ef67b stopped reading npos.claimed\nALTER TABLE "npos" DROP COLUMN "claimed";',
    ],
    [
      "inside a string literal",
      'SELECT \'\n-- contract: d7ef67b stopped reading npos.claimed\n\';\nALTER TABLE "npos" DROP COLUMN "claimed";',
    ],
    [
      "inside a block comment",
      '/*\n-- contract: d7ef67b stopped reading npos.claimed\n*/\nALTER TABLE "npos" DROP COLUMN "claimed";',
    ],
    [
      "inside a function body",
      'CREATE FUNCTION f() RETURNS void AS $$\n-- contract: d7ef67b stopped reading npos.claimed\n$$ LANGUAGE sql;\nALTER TABLE "npos" DROP COLUMN "claimed";',
    ],
    [
      "separated from its statement by another",
      '-- contract: d7ef67b stopped reading npos.claimed\nSELECT 1;\nALTER TABLE "npos" DROP COLUMN "claimed";',
    ],
  ])("a marker %s waives nothing", (_, sql) => {
    expect(check_migration("0046_x.sql", sql)).toHaveLength(1);
  });

  test.each([
    'DO $$ BEGIN ALTER TABLE "npos" DROP COLUMN "claimed"; END $$;',
    'DO $do$ BEGIN IF EXISTS (SELECT 1) THEN ALTER TABLE "npos" DROP COLUMN "claimed"; END IF; END $do$;',
    'DO LANGUAGE plpgsql $$ BEGIN NULL; EXCEPTION WHEN others THEN DROP TABLE "claims"; END $$;',
  ])("a DO block runs now, so its body is scanned: %s", (sql) => {
    expect(check_migration("0046_x.sql", sql)).toHaveLength(1);
  });

  test("a marker above a DO block waives its body", () => {
    const sql = [
      "-- contract: d7ef67b stopped reading npos.claimed",
      'DO $$ BEGIN ALTER TABLE "npos" DROP COLUMN "claimed"; END $$;',
    ].join("\n");
    expect(check_migration("0046_x.sql", sql)).toEqual([]);
  });

  test.each([
    "CREATE PROCEDURE p() LANGUAGE plpgsql AS $body$ BEGIN DROP TABLE x; END $body$;",
    "CREATE OR REPLACE FUNCTION f() RETURNS void LANGUAGE sql AS $$ DROP TABLE x $$;",
  ])("a function or procedure body only runs when called: %s", (sql) => {
    expect(check_migration("0046_x.sql", sql)).toEqual([]);
  });

  test.each([
    ["an E-string's escaped quote", "UPDATE t SET a = E'it\\'s';"],
    ["a lowercase e-string", "UPDATE t SET a = e'\\\\';"],
    ["a $ inside an identifier", "SELECT a$b$c FROM t;"],
    ["a nested block comment", "/* outer /* inner */ still outer */"],
  ])("%s does not swallow the DDL after it", (_, head) => {
    const sql = `${head}\nALTER TABLE "npos" DROP COLUMN "claimed";\nSELECT 'x';`;
    const errors = check_migration("0046_x.sql", sql);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("drop column");
  });

  test("a nested block comment hides everything up to its last close", () => {
    const sql = '/* a /* b */ DROP TABLE "x"; */ SELECT 1;';
    expect(check_migration("0046_x.sql", sql)).toEqual([]);
  });

  test("a typed literal after a word ending in e is not an E-string", () => {
    const sql = `SELECT date'x\\';\nALTER TABLE "npos" DROP COLUMN "claimed";`;
    expect(check_migration("0046_x.sql", sql)).toHaveLength(1);
  });

  test.each([
    'ALTER TABLE "npos" ADD COLUMN "default" boolean NOT NULL;',
    'ALTER TABLE "npos" ADD COLUMN "generated" integer NOT NULL;',
  ])(
    "a column named like the exempting keyword is still flagged: %s",
    (sql) => {
      const errors = check_migration("0046_x.sql", sql);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("add not null column without default");
    }
  );

  test.each([
    'ALTER TABLE "npos" ADD COLUMN "rename" text;',
    'ALTER TABLE "npos" ADD COLUMN "set not null" text;',
    'CREATE INDEX "drop_default_idx" ON "npos" ("x");',
  ])("a quoted identifier spelling a keyword is not one: %s", (sql) => {
    expect(check_migration("0046_x.sql", sql)).toEqual([]);
  });

  test.each([
    "ALTER TABLE npos ALTER COLUMN type SET DEFAULT 'x';",
    "ALTER TABLE npos ALTER type SET DEFAULT 'x';",
    "ALTER TABLE type ADD COLUMN x text;",
  ])("a column or table named type is not a type change: %s", (sql) => {
    expect(check_migration("0046_x.sql", sql)).toEqual([]);
  });

  test.each([
    'DROP VIEW "public"."v_bal";--> statement-breakpoint\nCREATE VIEW "public"."v_bal" AS (select 1);',
    'DROP VIEW "v_bal";--> statement-breakpoint\nCREATE VIEW public.V_BAL AS (select 1);',
    'DROP MATERIALIZED VIEW IF EXISTS "mv";\nCREATE MATERIALIZED VIEW "public"."mv" AS (select 1);',
    'DROP VIEW "v_bal" CASCADE;\nCREATE VIEW "v_bal" AS (select 1);',
  ])("a view dropped and recreated in the same file passes: %s", (sql) => {
    expect(check_migration("0046_x.sql", sql)).toEqual([]);
  });

  test.each([
    'CREATE VIEW "public"."v_bal" AS (select 1);\nDROP VIEW "public"."v_bal";',
    'DROP VIEW "public"."v_bal";\nCREATE VIEW "public"."v_other" AS (select 1);',
    'DROP VIEW "public"."v_bal";\nCREATE VIEW "audit"."v_bal" AS (select 1);',
    'DROP VIEW "a", "b";\nCREATE VIEW "a" AS (select 1);',
  ])("a view dropped and not recreated after fails: %s", (sql) => {
    const errors = check_migration("0046_x.sql", sql);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("drop view");
  });

  test("a marker without a sha does not acknowledge it", () => {
    const sql = [
      "-- contract: stopped reading npos.claimed",
      'ALTER TABLE "npos" DROP COLUMN "claimed";',
    ].join("\n");
    expect(check_migration("0046_drop_claimed.sql", sql)).toHaveLength(1);
  });

  test("a marker with a sha but nothing it stopped reading does not either", () => {
    const sql = [
      "-- contract: d7ef67b",
      'ALTER TABLE "npos" DROP COLUMN "claimed";',
    ].join("\n");
    expect(check_migration("0046_drop_claimed.sql", sql)).toHaveLength(1);
  });

  test("a destructive keyword inside a -- comment does not trigger", () => {
    const sql = [
      "-- next release will DROP COLUMN legacy; DROP TABLE old_things",
      'ALTER TABLE "npos" ADD COLUMN "x" text;--> statement-breakpoint',
      'CREATE INDEX "npos_x_idx" ON "npos" ("x"); -- not a DROP TABLE',
    ].join("\n");
    expect(check_migration("0046_add_x.sql", sql)).toEqual([]);
  });
});
