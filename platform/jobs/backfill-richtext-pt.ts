/**
 * Slate JSON → Portable Text JSON backfill.
 *
 * usage:
 *   DATABASE_URL=<neon-dev-branch>  bun jobs/backfill-richtext-pt.ts [--dry-run]
 *   DATABASE_URL=$NEON_DATABASE_URL bun jobs/backfill-richtext-pt.ts --prod
 *
 * idempotent: only rows where `*_pt IS NULL AND *_rich IS NOT NULL` are touched.
 *
 * safety: refuses to run against prod unless `--prod` is passed. detects prod by
 *   matching DATABASE_URL against NEON_DATABASE_URL.
 */
import { createHash } from "node:crypto";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { funds } from "../.server/pg/schema/fund";
import { npos } from "../.server/pg/schema/npo";
import { milestones, programs } from "../.server/pg/schema/program";

const DRY = process.argv.includes("--dry-run");
const PROD_ACK = process.argv.includes("--prod");

const target = process.env.DATABASE_URL;
const prod = process.env.NEON_DATABASE_URL;
if (!target) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const is_prod_target = !!prod && target === prod;
if (is_prod_target && !PROD_ACK) {
  console.error(
    "refusing to run: DATABASE_URL matches NEON_DATABASE_URL (prod). pass --prod to acknowledge."
  );
  process.exit(1);
}
if (!is_prod_target && PROD_ACK) {
  console.error(
    "--prod was passed but DATABASE_URL does not match NEON_DATABASE_URL. aborting."
  );
  process.exit(1);
}

// hostname-only banner so we don't leak credentials in logs
const host = (() => {
  try {
    return new URL(target).host;
  } catch {
    return "<unparseable>";
  }
})();
console.log(`target host: ${host}${is_prod_target ? " (PROD)" : ""}`);

// db import is deferred until after the guard so a misconfigured run can't
// open a pool against prod before we bail.
const { db } = await import("../.server/pg/db");

// --- converter ---------------------------------------------------------------

type SlateLeaf = {
  text?: string;
  bold?: boolean;
  italic?: boolean;
  link?: string;
};
type SlateInline = SlateLeaf;
type SlateElement = {
  type: "paragraph" | "bulleted-list" | "numbered-list" | "list-item";
  children: Array<SlateInline | SlateElement>;
};

type PtSpan = { _key: string; _type: "span"; text: string; marks: string[] };
type PtMarkDef = { _key: string; _type: "link"; href: string };
type PtBlock = {
  _key: string;
  _type: "block";
  style: "normal";
  markDefs: PtMarkDef[];
  children: PtSpan[];
  listItem?: "bullet" | "number";
  level?: number;
};

const key = (row_id: string, ...parts: Array<string | number>): string =>
  "k" +
  createHash("sha1")
    .update(`${row_id}|${parts.join("|")}`)
    .digest("hex")
    .slice(0, 12);

function leaves_to_block(
  row_id: string,
  block_idx: number,
  leaves: SlateLeaf[],
  list_item?: "bullet" | "number"
): PtBlock {
  const mark_def_by_href = new Map<string, string>();
  const children: PtSpan[] = leaves
    .filter((l) => typeof l.text === "string")
    .map((l, i) => {
      const marks: string[] = [];
      if (l.bold) marks.push("strong");
      if (l.italic) marks.push("em");
      if (l.link) {
        let mk = mark_def_by_href.get(l.link);
        if (!mk) {
          mk = key(row_id, block_idx, "md", l.link);
          mark_def_by_href.set(l.link, mk);
        }
        marks.push(mk);
      }
      return {
        _key: key(row_id, block_idx, "s", i),
        _type: "span",
        text: l.text ?? "",
        marks,
      } satisfies PtSpan;
    });

  // PT requires at least one child span.
  if (children.length === 0) {
    children.push({
      _key: key(row_id, block_idx, "s", 0),
      _type: "span",
      text: "",
      marks: [],
    });
  }

  const markDefs: PtMarkDef[] = Array.from(mark_def_by_href.entries()).map(
    ([href, _key]) => ({ _key, _type: "link", href })
  );

  return {
    _key: key(row_id, block_idx),
    _type: "block",
    style: "normal",
    markDefs,
    children,
    ...(list_item ? { listItem: list_item, level: 1 } : {}),
  };
}

function is_pt_doc(v: unknown): v is PtBlock[] {
  return (
    Array.isArray(v) &&
    v.every((b) => b && typeof b === "object" && (b as any)._type === "block")
  );
}

export function slate_to_pt(
  row_id: string,
  json: string | null | undefined
): PtBlock[] {
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    // raw text fallback (matches legacy helpers behavior)
    return [leaves_to_block(row_id, 0, [{ text: json }])];
  }
  if (is_pt_doc(parsed)) return parsed;
  if (!Array.isArray(parsed)) return [];

  const blocks: PtBlock[] = [];
  let block_idx = 0;
  for (const node of parsed as SlateElement[]) {
    if (!node || typeof node !== "object") continue;
    if (node.type === "paragraph") {
      blocks.push(
        leaves_to_block(
          row_id,
          block_idx++,
          (node.children ?? []) as SlateLeaf[]
        )
      );
    } else if (node.type === "bulleted-list" || node.type === "numbered-list") {
      const list_item = node.type === "bulleted-list" ? "bullet" : "number";
      for (const item of node.children ?? []) {
        if ((item as SlateElement).type !== "list-item") continue;
        blocks.push(
          leaves_to_block(
            row_id,
            block_idx++,
            ((item as SlateElement).children ?? []) as SlateLeaf[],
            list_item
          )
        );
      }
    }
  }
  return blocks;
}

// --- backfill ---------------------------------------------------------------

async function backfill_programs(): Promise<number> {
  const rows = await db
    .select({ id: programs.id, rich: programs.description_rich })
    .from(programs)
    .where(
      and(isNull(programs.description_pt), isNotNull(programs.description_rich))
    );
  let updated = 0;
  for (const r of rows) {
    const pt = JSON.stringify(slate_to_pt(r.id, r.rich));
    if (DRY) continue;
    await db
      .update(programs)
      .set({ description_pt: pt })
      .where(eq(programs.id, r.id));
    updated++;
  }
  console.log(`programs: ${rows.length} candidates, ${updated} updated`);
  return rows.length;
}

async function backfill_milestones(): Promise<number> {
  const rows = await db
    .select({ id: milestones.id, rich: milestones.description_rich })
    .from(milestones)
    .where(
      and(
        isNull(milestones.description_pt),
        isNotNull(milestones.description_rich)
      )
    );
  let updated = 0;
  for (const r of rows) {
    const pt = JSON.stringify(slate_to_pt(r.id, r.rich));
    if (DRY) continue;
    await db
      .update(milestones)
      .set({ description_pt: pt })
      .where(eq(milestones.id, r.id));
    updated++;
  }
  console.log(`milestones: ${rows.length} candidates, ${updated} updated`);
  return rows.length;
}

async function backfill_npos(): Promise<number> {
  const rows = await db
    .select({ id: npos.id, rich: npos.overview_rich })
    .from(npos)
    .where(and(isNull(npos.overview_pt), isNotNull(npos.overview_rich)));
  let updated = 0;
  for (const r of rows) {
    const pt = JSON.stringify(slate_to_pt(String(r.id), r.rich));
    if (DRY) continue;
    await db.update(npos).set({ overview_pt: pt }).where(eq(npos.id, r.id));
    updated++;
  }
  console.log(`npos: ${rows.length} candidates, ${updated} updated`);
  return rows.length;
}

async function backfill_funds(): Promise<number> {
  const rows = await db
    .select({ id: funds.id, rich: funds.description_rich })
    .from(funds)
    .where(
      and(isNull(funds.description_pt), isNotNull(funds.description_rich))
    );
  let updated = 0;
  for (const r of rows) {
    const pt = JSON.stringify(slate_to_pt(r.id, r.rich));
    if (DRY) continue;
    await db
      .update(funds)
      .set({ description_pt: pt })
      .where(eq(funds.id, r.id));
    updated++;
  }
  console.log(`funds: ${rows.length} candidates, ${updated} updated`);
  return rows.length;
}

async function main() {
  console.log(DRY ? "DRY RUN" : "LIVE RUN");
  await backfill_programs();
  await backfill_milestones();
  await backfill_npos();
  await backfill_funds();
  // silence "unused" warning — sql import is here in case of future ad-hoc queries.
  void sql;
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
