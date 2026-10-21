import { eq } from "drizzle-orm";
import { OFFLINE_SOURCE } from "@/donations/offline";
import type { DbOrTx } from "../pg/queries/helpers";
import { campaign_members, campaigns } from "../pg/schema/campaign";
import {
  donation_donors,
  donation_recipients,
  donations,
} from "../pg/schema/donation";
import { npos } from "../pg/schema/npo";
import { json, open_key, valid_day } from "./http";
import { with_idempotency } from "./idempotency";
import { type FieldError, invalid, problem } from "./problem";
import { read_campaign_detail, read_gift_by_id } from "./reads";

const TITLE_MAX = 200;
const NAME_MAX = 200;
const NOTE_MAX = 2000;
const AMOUNT_MAX = 1_000_000_000;
const HAND_DOMAIN = "@recorded.invalid";

type Issue = FieldError;

function campaign_slug(title: string, id: string): string {
  const stem = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return `${stem || "campaign"}-${id.slice(0, 8)}`;
}

function as_record(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function unknown_keys(
  body: Record<string, unknown>,
  allowed: readonly string[],
  issues: Issue[]
) {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      issues.push({ path: key, message: "is not a field on this action" });
    }
  }
}

async function read_body(
  request: Request
): Promise<
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: Response }
> {
  const issues: Issue[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(await request.text());
  } catch {
    issues.push({ path: "", message: "is a JSON object" });
    return { ok: false, response: invalid(issues) };
  }
  const body = as_record(parsed);
  if (!body) {
    return {
      ok: false,
      response: invalid([{ path: "", message: "is a JSON object" }]),
    };
  }
  return { ok: true, body };
}

export async function create_campaign(
  db: DbOrTx,
  request: Request
): Promise<Response> {
  if (request.method !== "POST") return problem(404, "unknown_action");
  const live = await open_key(db, request);
  if (live instanceof Response) return live;
  return with_idempotency(db, live.id, request, () =>
    insert_campaign(db, live.npo_id, live.allowed_by, request)
  );
}

async function insert_campaign(
  db: DbOrTx,
  npo_id: number,
  allowed_by: string,
  request: Request
): Promise<Response> {
  const parsed = await read_body(request);
  if (!parsed.ok) return parsed.response;
  const issues: Issue[] = [];
  unknown_keys(parsed.body, ["title"], issues);
  const title = parsed.body.title;
  const trimmed = typeof title === "string" ? title.trim() : "";
  if (
    typeof title !== "string" ||
    trimmed.length < 1 ||
    trimmed.length > TITLE_MAX
  ) {
    issues.push({
      path: "title",
      message: `is the campaign's name, 1 to ${TITLE_MAX} characters`,
    });
  }
  if (issues.length > 0) return invalid(issues);

  try {
    const id = crypto.randomUUID();
    const detail = await db.transaction(async (tx) => {
      const [npo] = await tx
        .select({
          overview_pt: npos.overview_pt,
          logo: npos.logo,
          image: npos.image,
          card_img: npos.card_img,
        })
        .from(npos)
        .where(eq(npos.id, npo_id));
      if (!npo) throw new Error("npo missing");
      const image = npo.logo || npo.image || npo.card_img || null;
      await tx.insert(campaigns).values({
        id,
        owner_npo_id: npo_id,
        creator_id: allowed_by,
        name: trimmed,
        slug: campaign_slug(trimmed, id),
        description_pt: npo.overview_pt || "[]",
        banner: image,
        logo: image,
        status: "draft",
      });
      await tx.insert(campaign_members).values({
        campaign_id: id,
        npo_id,
        position: 0,
      });
      return read_campaign_detail(tx, npo_id, id);
    });
    if (!detail) {
      return problem(500, "write_failed", {
        detail: "The campaign could not be saved.",
      });
    }
    return json(detail, 201);
  } catch {
    return problem(500, "write_failed", {
      detail: "The campaign could not be saved.",
    });
  }
}

function decimal_amount(
  value: unknown,
  path: string,
  issues: Issue[]
): number | null {
  if (typeof value !== "string" || !/^\d+(\.\d{1,2})?$/.test(value)) {
    issues.push({ path, message: 'is a decimal string such as "25.00"' });
    return null;
  }
  const n = Number(value);
  if (!(n > 0) || n > AMOUNT_MAX) {
    issues.push({ path, message: "is greater than 0" });
    return null;
  }
  return n;
}

function read_amount(value: unknown, issues: Issue[]): number | null {
  if (typeof value === "string") return decimal_amount(value, "amount", issues);
  const row = as_record(value);
  if (!row) {
    issues.push({
      path: "amount",
      message:
        'is a USD amount, as a decimal string or { amount, currency: "USD" }',
    });
    return null;
  }
  for (const key of Object.keys(row)) {
    if (key !== "amount" && key !== "currency") {
      issues.push({
        path: `amount.${key}`,
        message: "is not a field on an amount",
      });
    }
  }
  if (row.currency !== "USD") {
    issues.push({ path: "amount.currency", message: "is USD" });
  }
  return decimal_amount(row.amount, "amount.amount", issues);
}

function today_utc(): string {
  return new Date().toISOString().slice(0, 10);
}

function valid_email(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function record_donation(
  db: DbOrTx,
  request: Request
): Promise<Response> {
  if (request.method !== "POST") return problem(404, "unknown_action");
  const live = await open_key(db, request);
  if (live instanceof Response) return live;
  return with_idempotency(db, live.id, request, () =>
    insert_donation(db, live.npo_id, request)
  );
}

async function insert_donation(
  db: DbOrTx,
  npo_id: number,
  request: Request
): Promise<Response> {
  const parsed = await read_body(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const issues: Issue[] = [];
  if ("campaign_id" in body) {
    issues.push({
      path: "campaign_id",
      message: "is left out: a hand-recorded gift is not tied to a campaign",
    });
  }
  unknown_keys(
    body,
    ["amount", "date", "donor", "method", "note", "campaign_id"],
    issues
  );
  const amount = read_amount(body.amount, issues);
  const date = body.date;
  let day = "";
  if (typeof date !== "string" || !valid_day(date)) {
    issues.push({ path: "date", message: "is a day written YYYY-MM-DD" });
  } else if (date > today_utc()) {
    issues.push({ path: "date", message: "is not in the future" });
  } else {
    day = date;
  }
  if (body.method !== "cash" && body.method !== "check") {
    issues.push({ path: "method", message: "is cash or check" });
  }
  const donor = as_record(body.donor);
  let donor_name = "";
  let donor_email: string | null = null;
  if (!donor) {
    issues.push({
      path: "donor",
      message: "is { name, email? }",
    });
  } else {
    for (const key of Object.keys(donor)) {
      if (key !== "name" && key !== "email") {
        issues.push({
          path: `donor.${key}`,
          message: "is not a field on a donor",
        });
      }
    }
    const name = typeof donor.name === "string" ? donor.name.trim() : "";
    if (
      typeof donor.name !== "string" ||
      name.length < 1 ||
      name.length > NAME_MAX
    ) {
      issues.push({
        path: "donor.name",
        message: `is the donor's name, 1 to ${NAME_MAX} characters`,
      });
    } else {
      donor_name = name;
    }
    if (donor.email !== undefined && donor.email !== null) {
      if (typeof donor.email !== "string" || !valid_email(donor.email.trim())) {
        issues.push({
          path: "donor.email",
          message: "is an email address, or left out",
        });
      } else {
        donor_email = donor.email.trim().toLowerCase();
      }
    }
  }
  let note: string | null = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== "string" || body.note.trim().length > NOTE_MAX) {
      issues.push({
        path: "note",
        message: `is at most ${NOTE_MAX} characters`,
      });
    } else {
      note = body.note.trim() || null;
    }
  }
  if (issues.length > 0 || amount === null || !day || !donor_name) {
    return invalid(
      issues.length
        ? issues
        : [{ path: "", message: "is a hand-recorded gift" }]
    );
  }
  const method = body.method === "check" ? "check" : "cash";

  try {
    const id = crypto.randomUUID();
    const at = `${day}T12:00:00.000Z`;
    const email = donor_email ?? `hand-${id}${HAND_DOMAIN}`;
    const gift = await db.transaction(async (tx) => {
      const [npo] = await tx
        .select({ name: npos.name })
        .from(npos)
        .where(eq(npos.id, npo_id));
      if (!npo) throw new Error("npo missing");
      await tx.insert(donations).values({
        id,
        upusd: 1,
        status: "settled",
        amount_base: amount,
        amount_tip: 0,
        amount_fee_allowance: 0,
        currency: "USD",
        frequency: "one-time",
        source: OFFLINE_SOURCE,
        note,
        via: method,
        created_at: at,
        updated_at: at,
      });
      await tx.insert(donation_recipients).values({
        donation_id: id,
        npo_id,
        name: npo.name,
        type: "npo",
      });
      await tx.insert(donation_donors).values({
        donation_id: id,
        email,
        name: donor_name,
      });
      return read_gift_by_id(tx, npo_id, id);
    });
    if (!gift) {
      return problem(500, "write_failed", {
        detail: "The gift could not be saved.",
      });
    }
    return json(gift, 201);
  } catch {
    return problem(500, "write_failed", {
      detail: "The gift could not be saved.",
    });
  }
}
