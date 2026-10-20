import { safeParse } from "valibot";
import { is_unique_violation } from "$/pg/errors";
import type { ICampaignInput, ICampaignPatch } from "$/pg/queries/campaign";
import { npo_program_get } from "$/pg/queries/program";
import { campaign_body, type ICampaignBody } from "./schema";

export { ORG_SLUG_PROMPT, SLUG_LOCK_NOTE, slug_taken_message } from "./copy";

export function slug_taken(err: unknown) {
  return (
    is_unique_violation(err, "campaigns_owner_npo_slug_idx") ||
    is_unique_violation(err, "campaigns_owner_user_slug_idx")
  );
}

function blank(s: string | undefined): string | null {
  if (!s) return null;
  return s;
}

export async function to_fields(
  npo_id: number,
  body: ICampaignBody,
  hide_bg_tip: boolean
): Promise<
  { error: string } | Omit<ICampaignInput, "id" | "owner_npo_id" | "creator_id">
> {
  let program_id: string | null = null;
  let program_name: string | null = null;
  if (body.program_id) {
    const prog = await npo_program_get(body.program_id, npo_id);
    if (!prog) return { error: "That program is not on this nonprofit." };
    program_id = prog.id;
    program_name = prog.title;
  }
  return {
    name: body.name,
    slug: body.slug,
    campaign_type: body.campaign_type ?? null,
    description_pt: body.description_pt,
    banner: blank(body.banner),
    logo: blank(body.logo),
    videos: body.videos ?? [],
    ends_at: blank(body.ends_at),
    donate_methods: body.donate_methods,
    donate_frequencies: body.donate_frequencies,
    increments: body.increments ?? [],
    target: body.target,
    // settlement reads the nonprofit's tip setting. a campaign value that
    // disagrees would show a tip and still charge the organization.
    hide_bg_tip,
    program_id,
    program_name,
  };
}

export function to_patch(
  fields: Omit<ICampaignInput, "id" | "owner_npo_id" | "creator_id">
): ICampaignPatch {
  return fields;
}

export async function read_body(request: Request) {
  const json: unknown = await request.json().catch(() => undefined);
  if (json === undefined) return { error: "Request body is not JSON." };
  const op = (json as { op?: unknown }).op;
  if (op === "end" || op === "delete") return { op };
  const parsed = safeParse(campaign_body, json);
  if (parsed.issues) return { error: parsed.issues[0].message };
  return { body: parsed.output };
}
