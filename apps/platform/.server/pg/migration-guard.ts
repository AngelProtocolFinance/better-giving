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
  | { match: (bare: string, at: Context) => boolean }
);

/** a statement with its identifiers kept, and the file's statements after it */
type Context = { text: string; later: string[] };

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

const QNAME = String.raw`${IDENT}(?:\s*\.\s*${IDENT})?`;
const DROP_VIEW =
  /^DROP\s+(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+EXISTS\s+)?(.*?)(?:\s+(?:CASCADE|RESTRICT))?$/i;
const CREATE_VIEW = new RegExp(
  String.raw`^CREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:TEMP|TEMPORARY|RECURSIVE)\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(${QNAME})`,
  "i"
);

/** `"public"."V"`, `public."V"` and `"V"` name one view; unquoted folds to lower */
function view_key(qname: string): string {
  const parts = qname
    .match(new RegExp(IDENT, "g"))!
    .map((p) =>
      p.startsWith('"') ? p.slice(1, -1).replaceAll('""', '"') : p.toLowerCase()
    );
  return (parts.length === 1 ? ["public", ...parts] : parts).join(".");
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
    // supply a value. `IS NOT NULL` is a CHECK's expression, not the constraint
    match: (stmt) =>
      subcommands(stmt).some(
        (sub) =>
          ADD_COLUMN.test(sub) &&
          /(?<!\bIS\s+)\bNOT\s+NULL\b/i.test(sub) &&
          !/\b(?:DEFAULT|GENERATED|(?:SMALL|BIG)?SERIAL[248]?)\b/i.test(sub)
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
  {
    kind: "drop view",
    // drizzle-kit writes every view edit as DROP + CREATE, and drizzle-kit
    // migrate runs all pending files in one transaction, so a view recreated
    // later in the file is never missing to the old deployment
    match: (_, { text, later }) => {
      const recreated = new Set(
        later.flatMap((t) => {
          const m = CREATE_VIEW.exec(t);
          return m ? [view_key(m[1])] : [];
        })
      );
      const names = DROP_VIEW.exec(text)![1].match(new RegExp(QNAME, "g"))!;
      return names.some((n) => !recreated.has(view_key(n)));
    },
    scope: /^DROP\s+(?:MATERIALIZED\s+)?VIEW\b/i,
  },
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

const PLPGSQL_BLOCK = /("(?:[^"]|"")*")|\b(?:BEGIN|DECLARE|THEN|ELSE|LOOP)\b/gi;

/** a plpgsql statement's SQL, with the block keywords before it cut off */
function plpgsql_parts(stmt: string): string[] {
  return stmt
    .replace(PLPGSQL_BLOCK, (_, quoted) => quoted ?? ";")
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
}

/** `-- contract: <sha> <what that release changed>` */
const CONTRACT_MARKER = /^--[ \t]*contract:[ \t]*[0-9a-f]{7,40}[ \t]+\S/i;

/** one statement, comments and literals blanked; `marked` by its own marker */
type Statement = { text: string; marked: boolean };

/**
 * splits on `;`, blanking what the server never runs as DDL: `--` and block
 * comments (drizzle's `--> statement-breakpoint` among them), string literals,
 * and dollar-quoted strings and function bodies. a DO block's body runs now, so
 * its statements are returned too. "quoted identifiers" are kept. a contract
 * marker counts only as a `--` comment opening its line, and waives the next
 * statement if nothing but comments comes between.
 */
function statements(sql: string): Statement[] {
  const out: Statement[] = [];
  let text = "";
  let marked = false;
  let pending_marker = false;
  let line_start = true;
  const code = (s: string) => {
    if (text === "" && s.trim() === "") return;
    if (text === "") marked = pending_marker;
    pending_marker = false;
    if (/\S/.test(s)) line_start = false;
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
      if (line_start && CONTRACT_MARKER.test(sql.slice(i, stop))) {
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
        // the body runs now; markers inside it are not this file's
        for (const inner of statements(sql.slice(i + tag.length, body_end))) {
          for (const part of plpgsql_parts(inner.text)) {
            out.push({ text: part, marked });
          }
        }
      }
      code("$$");
      i = close < 0 ? sql.length : close + tag.length;
    } else if (sql[i] === ";") {
      end();
      pending_marker = false;
      i++;
    } else {
      code(sql[i]);
      if (sql[i] === "\n") line_start = true;
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
  const all = statements(sql);
  for (const [k, { text: stmt, marked }] of all.entries()) {
    if (marked) continue;
    const at = { text: stmt, later: all.slice(k + 1).map((s) => s.text) };
    // a keyword inside "quoted identifier" is a name, not the keyword
    const bare = stmt.replace(QUOTED_IDENT, '""');
    for (const rule of RULES) {
      if (rule.scope && !rule.scope.test(bare)) continue;
      if ("re" in rule ? rule.re.test(bare) : rule.match(bare, at)) {
        errors.push(
          `${file}: ${rule.kind} without a "-- contract: <sha> <what that release changed>" line above it — ${stmt}`
        );
      }
    }
  }
  return errors;
}
