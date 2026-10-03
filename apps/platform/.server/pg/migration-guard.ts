const IDENT = String.raw`(?:"(?:[^"]|"")*"|\w+)`;
const ALTER_TABLE = /^ALTER\s+TABLE\b/i;

/**
 * statements that break the deployment still serving traffic while the build
 * migrates: it reads or writes the old shape. each runs against one statement,
 * comments and literals already blanked out.
 */
type Rule = { kind: string; scope?: RegExp } & (
  | { re: RegExp }
  | { match: (stmt: string) => boolean }
);

/** an ALTER TABLE's comma-separated subcommands, commas inside parens kept */
function subcommands(stmt: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < stmt.length; i++) {
    if (stmt[i] === "(") depth++;
    else if (stmt[i] === ")") depth--;
    else if (stmt[i] === "," && depth === 0) {
      parts.push(stmt.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(stmt.slice(start));
  return parts.map((p) => p.trim());
}

const ADD_COLUMN = new RegExp(
  String.raw`\bADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?!(?:CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN|EXCLUDE)\b)${IDENT}`,
  "i"
);

const RULES: Rule[] = [
  { kind: "drop table", re: /^DROP\s+TABLE\b/i },
  {
    kind: "drop column",
    // COLUMN is optional in `ALTER TABLE … DROP`; the other DROP subforms are keyword-led
    re: new RegExp(
      String.raw`\bDROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?(?!(?:CONSTRAINT|NOT|DEFAULT|EXPRESSION|IDENTITY)\b)${IDENT}`,
      "i"
    ),
    scope: ALTER_TABLE,
  },
  {
    kind: "rename",
    // a constraint or index name is invisible to the app's queries
    re: /\bRENAME\b(?!\s+CONSTRAINT\b)/i,
    scope: /^ALTER\s+(?:TABLE|TYPE|VIEW|MATERIALIZED\s+VIEW|SCHEMA)\b/i,
  },
  {
    kind: "alter column type",
    // drizzle-kit writes `SET DATA TYPE`; COLUMN is optional
    re: new RegExp(
      String.raw`\bALTER\s+(?:COLUMN\s+)?${IDENT}\s+(?:SET\s+DATA\s+)?TYPE\b`,
      "i"
    ),
    scope: ALTER_TABLE,
  },
  { kind: "set not null", re: /\bSET\s+NOT\s+NULL\b/i, scope: ALTER_TABLE },
  {
    kind: "add not null column without default",
    // the old deployment's inserts omit the new column; GENERATED supplies a value
    match: (stmt) =>
      subcommands(stmt).some(
        (sub) =>
          ADD_COLUMN.test(sub) &&
          /\bNOT\s+NULL\b/i.test(sub) &&
          !/\b(?:DEFAULT|GENERATED)\b/i.test(sub)
      ),
    scope: ALTER_TABLE,
  },
  // an old insert that omits the column relied on it
  { kind: "drop default", re: /\bDROP\s+DEFAULT\b/i, scope: ALTER_TABLE },
  // also how drizzle-kit removes an enum value: drop and recreate the type
  { kind: "drop type", re: /^DROP\s+TYPE\b/i },
  // CREATE OR REPLACE VIEW is the additive form: postgres rejects it dropping a column
  { kind: "drop view", re: /^DROP\s+(?:MATERIALIZED\s+)?VIEW\b/i },
  { kind: "drop schema", re: /^DROP\s+SCHEMA\b/i },
];

/**
 * blanks out what the server never runs as DDL: `--` and block comments
 * (drizzle's `--> statement-breakpoint` among them), string literals, and
 * dollar-quoted function bodies. "quoted identifiers" are kept.
 */
function strip_non_code(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    if (rest.startsWith("--")) {
      const nl = sql.indexOf("\n", i);
      i = nl < 0 ? sql.length : nl;
    } else if (rest.startsWith("/*")) {
      const end = sql.indexOf("*/", i + 2);
      i = end < 0 ? sql.length : end + 2;
    } else if (sql[i] === "'") {
      const m = /^'(?:[^']|'')*'?/.exec(rest)!;
      out += "''";
      i += m[0].length;
    } else if (sql[i] === '"') {
      const m = /^"(?:[^"]|"")*"?/.exec(rest)!;
      out += m[0];
      i += m[0].length;
    } else if (/^\$\w*\$/.test(rest)) {
      const tag = /^\$\w*\$/.exec(rest)![0];
      const end = sql.indexOf(tag, i + tag.length);
      out += "$$";
      i = end < 0 ? sql.length : end + tag.length;
    } else {
      out += sql[i];
      i++;
    }
  }
  return out;
}

function statements(sql: string): string[] {
  return strip_non_code(sql)
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function check_journal(
  entries: { idx: number; when: number; tag: string }[],
  sql_files: string[]
): string[] {
  const errors: string[] = [];
  const files = new Set(sql_files);
  const tagged = new Set(entries.map((e) => `${e.tag}.sql`));
  entries.forEach((e, i) => {
    if (e.idx !== i) {
      errors.push(`_journal.json: ${e.tag} has idx ${e.idx} at position ${i}`);
    }
    if (!files.has(`${e.tag}.sql`)) {
      errors.push(`_journal.json: ${e.tag} has no ${e.tag}.sql`);
    }
    const prev = entries[i - 1];
    if (prev && e.when <= prev.when) {
      errors.push(
        `_journal.json: ${e.tag} has when ${e.when}, not after ${prev.tag}'s ${prev.when}; drizzle-kit migrate skips it wherever ${prev.tag} has run`
      );
    }
  });
  for (const f of sql_files) {
    if (!tagged.has(f)) {
      // create_test_db applies it, drizzle-kit migrate never does
      errors.push(`${f}: not in _journal.json, so production never runs it`);
    }
  }
  return errors;
}

/** `-- contract: <sha> <what that commit stopped reading>` */
const CONTRACT_MARKER =
  /^[ \t]*--[ \t]*contract:[ \t]*[0-9a-f]{7,40}[ \t]+\S/im;

/** 0000–0045 had all run in production before this guard existed */
const LAST_GRANDFATHERED = 45;

export function check_migration(file: string, sql: string): string[] {
  const num = /(?:^|\/)(\d+)_[^/]*$/.exec(file)?.[1];
  if (num !== undefined && Number(num) <= LAST_GRANDFATHERED) return [];
  if (CONTRACT_MARKER.test(sql)) return [];
  const errors: string[] = [];
  for (const stmt of statements(sql)) {
    for (const rule of RULES) {
      if (rule.scope && !rule.scope.test(stmt)) continue;
      if ("re" in rule ? rule.re.test(stmt) : rule.match(stmt)) {
        errors.push(
          `${file}: ${rule.kind} without a "-- contract: <sha> <what it stopped reading>" line — ${stmt}`
        );
      }
    }
  }
  return errors;
}
