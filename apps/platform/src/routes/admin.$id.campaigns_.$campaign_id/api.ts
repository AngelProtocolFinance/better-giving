import { data, href } from "react-router";
import { admin_ctx } from "#/.server/auth";
import { redirectWithSuccess } from "#/.server/toast";
import { resp } from "@/helpers/https";
import {
  campaign_delete,
  campaign_end,
  campaign_get,
  campaign_gift_count,
  campaign_publish,
  campaign_slug_refused,
  campaign_slug_taken,
  campaign_update,
} from "$/pg/queries/campaign";
import { npo_get } from "$/pg/queries/npo";
import { npo_programs } from "$/pg/queries/program";
import {
  read_body,
  SLUG_LOCK_NOTE,
  slug_taken,
  slug_taken_message,
  to_fields,
  to_patch,
} from "../admin.$id.campaigns/persist";
import type { Route } from "./+types/route";

async function owned(npo_id: number, campaign_id: string) {
  const row = await campaign_get(npo_id, campaign_id);
  if (!row) throw resp.status(404);
  return row;
}

export const loader = async ({
  context,
  params,
  request,
}: Route.LoaderArgs) => {
  const id = context.get(admin_ctx);
  const endow = await npo_get(id);
  if (!endow) throw resp.status(404);
  const campaign = await owned(id, params.campaign_id);
  const [programs, gift_count] = await Promise.all([
    npo_programs(id),
    campaign_gift_count(campaign.id),
  ]);
  const origin = new URL(request.url).origin;
  const campaign_url =
    endow.slug && campaign.slug
      ? `${origin}/org/${endow.slug}/${campaign.slug}`
      : null;
  return {
    endow,
    campaign,
    gift_count,
    campaign_url,
    programs: programs.map((p) => ({ id: p.id, title: p.title })),
  };
};

export const action = async ({
  request,
  context,
  params,
}: Route.ActionArgs) => {
  const id = context.get(admin_ctx);
  const campaign_id = params.campaign_id;
  const current = await owned(id, campaign_id);
  const read = await read_body(request);
  if ("error" in read) return data({ error: read.error }, { status: 400 });

  const back = href("/admin/:id/campaigns/:campaign_id", {
    id: String(id),
    campaign_id,
  });

  if ("op" in read && read.op === "delete") {
    const ok = await campaign_delete(id, campaign_id);
    if (!ok) {
      return data(
        { error: "A campaign with gifts cannot be deleted." },
        { status: 400 }
      );
    }
    return redirectWithSuccess(
      href("/admin/:id/campaigns", { id: String(id) }),
      "Campaign deleted"
    );
  }

  if ("op" in read && read.op === "end") {
    const ok = await campaign_end(id, campaign_id);
    if (!ok) throw resp.status(404);
    return redirectWithSuccess(back, "Campaign ended");
  }

  if (!("body" in read) || !read.body) {
    return data({ error: "Request body is not JSON." }, { status: 400 });
  }
  const body = read.body;
  if (await campaign_slug_refused(id, campaign_id, body.slug)) {
    return data({ error: SLUG_LOCK_NOTE }, { status: 400 });
  }
  const fields = await to_fields(id, body);
  if ("error" in fields) return data({ error: fields.error }, { status: 400 });
  if (await campaign_slug_taken(id, fields.slug, campaign_id)) {
    return data({ error: slug_taken_message() }, { status: 400 });
  }

  try {
    const ok = await campaign_update(id, campaign_id, to_patch(fields));
    if (!ok) throw resp.status(404);
  } catch (err) {
    if (slug_taken(err)) {
      return data({ error: slug_taken_message() }, { status: 400 });
    }
    throw err;
  }

  if (body.op === "publish") {
    if (current.status === "ended") {
      return data({ error: "An ended campaign stays ended." }, { status: 400 });
    }
    const live = await campaign_publish(id, campaign_id);
    if (!live) throw resp.status(404);
  }

  return redirectWithSuccess(
    back,
    body.op === "publish" ? "Campaign is live" : "Campaign saved"
  );
};
