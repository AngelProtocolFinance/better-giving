const QUOTED_IDENT = /"(?:[^"]|"")*"/g;
const IDENT = String.raw`(?:"(?:[^"]|"")*"|\w+)`;
const ALTER_TABLE = /^ALTER\s+TABLE\b/i;

/**
 * statements that break the deployment still serving traffic while the build
 * migrates: it reads or writes the old shape. each runs against one statement,
 * comments, literals and "quoted identifiers" already blanked out.
 */
type Rule = { kind: string; scope?: RegExp } & (
  | { re: RegExp }
  | { match: (bare: string) => boolean }
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

const FK_ACTION = /\bON\s+(?:DELETE|UPDATE)\s+SET\s+(?:DEFAULT|NULL)\b/gi;

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
    // a constraint or index name is invisible to the app's queries; SET SCHEMA
    // moves the name the old deployment's queries qualify
    re: /\bRENAME\b(?!\s+CONSTRAINT\b)|\bSET\s+SCHEMA\b/i,
    scope: /^ALTER\s+(?:TABLE|TYPE|VIEW|MATERIALIZED\s+VIEW|SCHEMA)\b/i,
  },
  {
    kind: "alter column type",
    // drizzle-kit writes `SET DATA TYPE`; COLUMN is optional
    re: new RegExp(
      String.raw`\bALTER\s+(?:COLUMN\s+)?(?!(?:COLUMN|TABLE)\b)${IDENT}\s+(?:SET\s+DATA\s+)?TYPE\b`,
      "i"
    ),
    scope: ALTER_TABLE,
  },
  { kind: "set not null", re: /\bSET\s+NOT\s+NULL\b/i, scope: ALTER_TABLE },
  {
    kind: "add not null column without default",
    // the old deployment's inserts omit the new column; GENERATED and serial
    // supply a value. `IS NOT NULL` is a CHECK's expression, not the constraint,
    // and a foreign key's `ON DELETE SET DEFAULT` is an action, not a default
    match: (stmt) =>
      subcommands(stmt).some(
        (sub) =>
          ADD_COLUMN.test(sub) &&
          /(?<!\bIS\s+)\bNOT\s+NULL\b/i.test(sub) &&
          !/\b(?:DEFAULT|GENERATED|(?:SMALL|BIG)?SERIAL[248]?)\b/i.test(
            sub.replace(FK_ACTION, "")
          )
      ),
    scope: ALTER_TABLE,
  },
  // an old insert that omits the column relied on it
  { kind: "drop default", re: /\bDROP\s+DEFAULT\b/i, scope: ALTER_TABLE },
  // DROP DEFAULT for an identity column
  { kind: "drop identity", re: /\bDROP\s+IDENTITY\b/i, scope: ALTER_TABLE },
  // an old insert that supplies the id is rejected
  {
    kind: "set generated always",
    re: /\bSET\s+GENERATED\s+ALWAYS\b/i,
    scope: ALTER_TABLE,
  },
  // also how drizzle-kit removes an enum value: drop and recreate the type
  { kind: "drop type", re: /^DROP\s+TYPE\b/i },
  // a recreate can still drop a column the old deployment selects; telling
  // needs the two column lists, so every view drop takes its own marker
  { kind: "drop view", re: /^DROP\s+(?:MATERIALIZED\s+)?VIEW\b/i },
  { kind: "drop schema", re: /^DROP\s+SCHEMA\b/i },
];

/** where a block comment opening at `start` closes; they nest */
function block_comment_end(sql: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < sql.length) {
    if (sql.startsWith("/*", i)) {
      depth++;
      i += 2;
    } else if (sql.startsWith("*/", i)) {
      depth--;
      i += 2;
      if (depth === 0) return i;
    } else i++;
  }
  return sql.length;
}

/**
 * whether only whitespace precedes `i` on its physical line. a DO body's first
 * line is the DO's own, so it never opens one
 */
function opens_line(sql: string, i: number, do_body: boolean): boolean {
  const nl = sql.lastIndexOf("\n", i - 1);
  if (nl < 0 && do_body) return false;
  return sql.slice(nl + 1, i).trim() === "";
}

/** in a DO body these end the statement before them, like `;` */
const PLPGSQL_BLOCK = /^(?:BEGIN|DECLARE|THEN|ELSE|LOOP)\b/i;

/** `-- contract: <sha> <what that release changed>` */
const CONTRACT_MARKER = /^--[ \t]*contract:[ \t]*[0-9a-f]{7,40}[ \t]+\S/i;

/** one statement, comments and literals blanked; `marked` by its own marker */
type Statement = { text: string; marked: boolean };

/**
 * splits on `;`, blanking what the server never runs as DDL: `--` and block
 * comments (drizzle's `--> statement-breakpoint` among them), string literals,
 * and dollar-quoted strings and function bodies. a DO block's body runs now, so
 * its statements are returned too, split at plpgsql's block keywords as well.
 * "quoted identifiers" are kept. a contract marker counts only as a `--`
 * comment opening its physical line, and waives the next statement if nothing
 * but comments comes between — inside a DO body too, never across its `$$`.
 */
function statements(sql: string, do_body = false): Statement[] {
  const out: Statement[] = [];
  let text = "";
  let marked = false;
  let pending_marker = false;
  const code = (s: string) => {
    if (text === "" && s.trim() === "") return;
    if (text === "") marked = pending_marker;
    pending_marker = false;
    text += s;
  };
  const end = () => {
    const t = text.replace(/\s+/g, " ").trim();
    if (t) out.push({ text: t, marked });
    text = "";
    marked = false;
  };
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    if (rest.startsWith("--")) {
      const nl = sql.indexOf("\n", i);
      const stop = nl < 0 ? sql.length : nl;
      if (
        opens_line(sql, i, do_body) &&
        CONTRACT_MARKER.test(sql.slice(i, stop))
      ) {
        pending_marker = true;
      }
      i = stop;
    } else if (rest.startsWith("/*")) {
      i = block_comment_end(sql, i);
    } else if (sql[i] === "'") {
      // E'…' takes backslash escapes; a word ending in e (`date'…'`) does not
      const e_string = /(?:^|[^\w$])[eE]$/.test(
        sql.slice(Math.max(0, i - 2), i)
      );
      const m = (
        e_string ? /^'(?:[^'\\]|\\[\s\S]|'')*'?/ : /^'(?:[^']|'')*'?/
      ).exec(rest)!;
      code("''");
      i += m[0].length;
    } else if (sql[i] === '"') {
      const m = /^"(?:[^"]|"")*"?/.exec(rest)!;
      code(m[0]);
      i += m[0].length;
    } else if (/^\$\w*\$/.test(rest) && !/[\w$]/.test(sql[i - 1] ?? "")) {
      const tag = /^\$\w*\$/.exec(rest)![0];
      const close = sql.indexOf(tag, i + tag.length);
      const body_end = close < 0 ? sql.length : close;
      if (/^\s*DO\b/i.test(text)) {
        // the body runs now, its statements each waived by their own marker
        out.push(...statements(sql.slice(i + tag.length, body_end), true));
      }
      code("$$");
      i = close < 0 ? sql.length : close + tag.length;
    } else if (sql[i] === ";") {
      end();
      pending_marker = false;
      i++;
    } else if (
      do_body &&
      PLPGSQL_BLOCK.test(rest) &&
      !/[\w$]/.test(sql[i - 1] ?? "")
    ) {
      end();
      pending_marker = false;
      i += PLPGSQL_BLOCK.exec(rest)![0].length;
    } else {
      code(sql[i]);
      i++;
    }
  }
  end();
  return out;
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
    // check_migration grandfathers by the file's number, so it must be the idx
    const num = /^(\d+)_/.exec(e.tag)?.[1];
    if (num === undefined || Number(num) !== e.idx) {
      errors.push(
        `_journal.json: ${e.tag} is numbered other than its idx ${e.idx}`
      );
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

/** 0000–0045 had all run in production before this guard existed */
const LAST_GRANDFATHERED = 45;

export function check_migration(file: string, sql: string): string[] {
  const num = /(?:^|\/)(\d+)_[^/]*$/.exec(file)?.[1];
  if (num !== undefined && Number(num) <= LAST_GRANDFATHERED) return [];
  const errors: string[] = [];
  for (const { text: stmt, marked } of statements(sql)) {
    if (marked) continue;
    // a keyword inside "quoted identifier" is a name, not the keyword
    const bare = stmt.replace(QUOTED_IDENT, '""');
    for (const rule of RULES) {
      if (rule.scope && !rule.scope.test(bare)) continue;
      if ("re" in rule ? rule.re.test(bare) : rule.match(bare)) {
        errors.push(
          `${file}: ${rule.kind} without a "-- contract: <sha> <what that release changed>" line above it — ${stmt}`
        );
      }
    }
  }
  return errors;
}
