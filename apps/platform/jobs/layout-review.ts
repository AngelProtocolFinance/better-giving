import { parseArgs } from "node:util";
import { and, asc, eq } from "drizzle-orm";
import { get_funds_npo_memberof } from "#/.server/funds";
import { to_text } from "#/components/rich-text/helpers";
import { org_href } from "#/helpers/org-href";
import { MAX_VIDEOS } from "#/routes/org.$org._index/api";
import { fund_item_is_open } from "@/fundraiser/is-open";
import {
  type IOrgShape,
  items_total,
  type TOrgLayout,
  threshold_layout,
} from "@/org-shape";
import { base_url, database } from "$/env";
import { pick_layout } from "$/org-layout";
import { db } from "$/pg/db";
import { campaign_live_for_npo } from "$/pg/queries/campaign";
import { npo_media_list } from "$/pg/queries/npo-media";
import { npo_programs } from "$/pg/queries/program";
import { npos } from "$/pg/schema/npo";

/**
 * the layout review list: each published, active org's measures, the layout
 * the thresholds give, the one Jev gives, and its page link — as csv, Jev and
 * the thresholds disagreeing first. `--help` has the flags.
 *
 * read-only, and reads whichever database the loaded env points at, so name
 * the env file: `bun --env-file=.env.staging jobs/layout-review.ts`. the shell
 * beats the file, so a stale `export DATABASE_URL` wins — the db host and the
 * link origin go to stderr first for that reason.
 *
 * Jev is asked through `pick_layout`, the page's own call with the page's
 * timeout, so an empty `jev` is what the page would get too: no key, a
 * timeout or an error, and the thresholds deciding.
 */

/** orgs measured and put to Jev at once; low, so the gateway's rate limit
 * isn't hammered */
const JEV_CONCURRENCY = 4;

export interface IReviewRow extends IOrgShape {
  id: number;
  name: string;
  link: string;
  items_total: number;
  threshold: TOrgLayout;
  /** null when Jev gave no answer (no key, timeout, error) */
  jev: TOrgLayout | null;
}

type TOrg = Pick<
  typeof npos.$inferSelect,
  "id" | "slug" | "name" | "overview_pt" | "tagline" | "image" | "logo"
>;

/** the measures `org.$org._index/api.ts` builds for the page, from the same
 * reads; a failed read throws here, where the page would count it as 0 */
async function org_shape(npo: TOrg, now: Date): Promise<IOrgShape> {
  const [campaigns, funds, programs, media] = await Promise.all([
    campaign_live_for_npo(npo.id),
    get_funds_npo_memberof(npo.id, { published: true }),
    npo_programs(npo.id),
    npo_media_list(npo.id, {
      type: "video",
      featured: true,
      limit: MAX_VIDEOS,
    }),
  ]);
  return {
    story_chars: to_text(npo.overview_pt).trim().length,
    tagline_chars: npo.tagline?.trim().length ?? 0,
    name_chars: npo.name.trim().length,
    has_banner: !!npo.image,
    has_logo: !!npo.logo,
    campaigns: campaigns.length,
    fundraisers: funds.filter((f) => fund_item_is_open(f, now)).length,
    programs: programs.length,
    videos: media.items.length,
  };
}

async function review_row(
  npo: TOrg,
  origin: string,
  now: Date
): Promise<IReviewRow> {
  const shape = await org_shape(npo, now);
  const pick = await pick_layout(shape);
  return {
    id: npo.id,
    name: npo.name,
    link: `${origin}${org_href(npo)}`,
    ...shape,
    items_total: items_total(shape),
    threshold: threshold_layout(shape),
    jev: pick.by === "jev" ? pick.layout : null,
  };
}

/** every published, active org with its measures and both layout picks */
export async function review_rows(opts: {
  origin: string;
  limit?: number;
}): Promise<IReviewRow[]> {
  const q = db
    .select({
      id: npos.id,
      slug: npos.slug,
      name: npos.name,
      overview_pt: npos.overview_pt,
      tagline: npos.tagline,
      image: npos.image,
      logo: npos.logo,
    })
    .from(npos)
    .where(and(eq(npos.published, true), eq(npos.active, true)))
    .orderBy(asc(npos.name), asc(npos.id));
  const orgs = await (opts.limit ? q.limit(opts.limit) : q);

  const now = new Date();
  // by index, so the rows keep the query's order whatever finishes first
  const rows = new Array<IReviewRow>(orgs.length);
  let next = 0;
  const worker = async () => {
    while (next < orgs.length) {
      const i = next++;
      rows[i] = await review_row(orgs[i]!, opts.origin, now);
    }
  };
  await Promise.all(Array.from({ length: JEV_CONCURRENCY }, worker));
  // stable, so each group keeps the query's name order
  return rows.sort((a, b) => +disagrees(b) - +disagrees(a));
}

const disagrees = (r: IReviewRow): boolean =>
  r.jev !== null && r.jev !== r.threshold;

const COLUMNS = [
  "id",
  "name",
  "link",
  "story_chars",
  "tagline_chars",
  "name_chars",
  "has_banner",
  "has_logo",
  "campaigns",
  "fundraisers",
  "programs",
  "videos",
  "items_total",
  "threshold",
  "jev",
  "agree",
] as const satisfies readonly (keyof IReviewRow | "agree")[];

/** rfc 4180, plus a leading `'` on a cell a spreadsheet would read as a
 * formula: names are whatever an org typed */
const cell = (v: string | number | boolean | null): string => {
  const s = String(v ?? "");
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

export function to_csv(rows: IReviewRow[]): string {
  const lines = rows.map((r) => {
    const agree = r.jev === null ? null : !disagrees(r);
    return COLUMNS.map((c) => cell(c === "agree" ? agree : r[c])).join(",");
  });
  return `${[COLUMNS.join(","), ...lines].join("\n")}\n`;
}

const USAGE = `usage: bun --env-file=<env file> jobs/layout-review.ts [--origin=<url>] [--limit=<n>]

  writes a csv to stdout: every published, active org with its measures, the
  threshold layout and Jev's, disagreements first, then by name. a summary goes
  to stderr. read-only; reads whichever database the loaded env points at.

  --origin=<url>  origin for each row's page link (default: the env's BASE_URL)
  --limit=<n>     only the first n orgs by name, for a quick sample
  --help          this text
`;

export class UsageError extends Error {
  override name = "UsageError";
}

export type TCli = { help: true } | { origin: string; limit?: number };

export function parse_cli(argv: string[], default_origin: string): TCli {
  let values: { origin?: string; limit?: string; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        origin: { type: "string" },
        limit: { type: "string" },
        help: { type: "boolean" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err) {
    // parseArgs' own message, up to its advice on positionals
    throw new UsageError(String((err as Error).message).split(". ")[0]);
  }
  if (values.help) return { help: true };

  const origin = URL.parse(values.origin ?? default_origin);
  if (!origin || !/^https?:$/.test(origin.protocol)) {
    throw new UsageError("--origin must be an http(s) url");
  }
  if (values.limit === undefined) return { origin: origin.origin };
  const limit = Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new UsageError("--limit must be a whole number above 0");
  }
  return { origin: origin.origin, limit };
}

async function main(): Promise<number> {
  let cli: TCli;
  try {
    cli = parse_cli(process.argv.slice(2), base_url);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    console.error(`layout-review: ${err.message}`);
    console.error("Run 'bun jobs/layout-review.ts --help' for usage.");
    return 2;
  }
  if ("help" in cli) {
    process.stdout.write(USAGE);
    return 0;
  }

  const host = URL.parse(database.url ?? "")?.hostname || "(no DATABASE_URL)";
  console.error(`layout-review: reading ${host}, links on ${cli.origin}`);
  const rows = await review_rows(cli);
  const disagree = rows.filter(disagrees).length;
  const unanswered = rows.filter((r) => r.jev === null).length;
  process.stdout.write(to_csv(rows));
  console.error(
    `layout-review: ${rows.length} orgs · ${disagree} disagree · ${rows.length - disagree - unanswered} agree · ${unanswered} with no answer from Jev`
  );
  return 0;
}

if (import.meta.main) {
  // a reader that stops early (`| head`) is not a failure
  process.stdout.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") process.exit(0);
    throw err;
  });
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      // fetch puts the network reason (ECONNREFUSED, a timeout) in `cause`
      const cause = err?.cause ? ` (${err.cause})` : "";
      console.error(`layout-review: ${err?.message ?? err}${cause}`);
      process.exitCode = 1;
    })
    // nothing here closes the db pool, so exit explicitly, once stdout has
    // drained
    .finally(() => process.stdout.write("", () => process.exit()));
}
