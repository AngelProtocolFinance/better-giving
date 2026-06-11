import { valibotResolver } from "@hookform/resolvers/valibot";
import type { ActionFunction } from "react-router";
import { getValidatedFormData } from "remix-hook-form";
import { safeParse } from "valibot";
import { admin_ctx } from "#/.server/auth";
import { dataWithSuccess, redirectWithSuccess } from "#/.server/toast";
import { resp } from "@/helpers/https";
import { media_id } from "@/npo/schema";
import {
  npo_media_delete,
  npo_media_get,
  npo_media_put,
  npo_media_update,
} from "$/pg/queries/npo-media";
import { type ISchema, schema } from "./schema";

export const videos_action: ActionFunction = async (x) => {
  const id = x.context.get(admin_ctx);

  const fv = await x.request.formData();
  const intent = fv.get("intent") as "feature" | "delete";
  const featured = fv.get("featured") === "1";
  const p_mid = safeParse(media_id, fv.get("mediaId"));
  if (p_mid.issues) return resp.status(400, p_mid.issues[0].message);
  const mid = p_mid.output;

  const prev = await npo_media_get(mid);
  if (!prev) return { status: 404 };

  if (intent === "feature") {
    await npo_media_update(id, prev.id, {
      featured: !featured,
    });
    return { ok: true };
  }

  await npo_media_delete(id, prev.id);
  return dataWithSuccess(null, "Video deleted");
};

export const new_action: ActionFunction = async (x) => {
  const id = x.context.get(admin_ctx);

  const fv = await getValidatedFormData<ISchema>(
    x.request,
    valibotResolver(schema)
  );
  if (fv.errors) return fv;

  await npo_media_put(id, fv.data.url);

  return redirectWithSuccess("..", "Video added");
};

export const edit_action: ActionFunction = async (x) => {
  const p_mid = safeParse(media_id, x.params.media_id);
  if (p_mid.issues) return resp.status(400, p_mid.issues[0].message);
  const mid = p_mid.output;
  const id = x.context.get(admin_ctx);

  const fv = await getValidatedFormData<ISchema>(
    x.request,
    valibotResolver(schema)
  );
  if (fv.errors) return fv;

  const m = await npo_media_get(mid);
  if (!m) return { status: 404 };

  await npo_media_update(id, m.id, {
    url: fv.data.url,
  });

  return redirectWithSuccess("..", "Video updated");
};
