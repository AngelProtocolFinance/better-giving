import { valibotResolver } from "@hookform/resolvers/valibot";
import type { ActionFunction } from "react-router";
import { getValidatedFormData } from "remix-hook-form";
import { safeParse } from "valibot";
import { admin_ctx } from "#/.server/auth";
import {
  dataWithError,
  dataWithSuccess,
  redirectWithSuccess,
} from "#/.server/toast";
import { resp } from "@/helpers/https";
import type { IMedia } from "@/npo";
import { media_id } from "@/npo/schema";
import {
  npo_media_delete,
  npo_media_get,
  npo_media_put,
  npo_media_update,
} from "$/pg/queries/npo-media";
import { type ISchema, schema } from "./schema";

type IMediaRow = IMedia & { npo_id: number };

/** `npo_media_get` is unscoped and the writes are scoped, so a foreign id
 * would no-op behind a success toast */
const get_own = async (npo_id: number, mid: string) => {
  const m = (await npo_media_get(mid)) as IMediaRow | undefined;
  return m?.npo_id === npo_id ? m : undefined;
};

export const videos_action: ActionFunction = async (x) => {
  const id = x.context.get(admin_ctx);

  const fv = await x.request.formData();
  const intent = fv.get("intent") as "feature" | "delete";
  const featured = fv.get("featured") === "1";
  const p_mid = safeParse(media_id, fv.get("mediaId"));
  if (p_mid.issues) throw resp.status(400, p_mid.issues[0].message);
  const mid = p_mid.output;

  const prev = await get_own(id, mid);
  if (!prev) return dataWithError(null, "Video not found");

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
  if (p_mid.issues) throw resp.status(400, p_mid.issues[0].message);
  const mid = p_mid.output;
  const id = x.context.get(admin_ctx);

  const fv = await getValidatedFormData<ISchema>(
    x.request,
    valibotResolver(schema)
  );
  if (fv.errors) return fv;

  const m = await get_own(id, mid);
  if (!m) return dataWithError(null, "Video not found");

  await npo_media_update(id, m.id, {
    url: fv.data.url,
  });

  return redirectWithSuccess("..", "Video updated");
};
