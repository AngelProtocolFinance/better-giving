import { type ActionFunction, redirect } from "react-router";
import { safeParse } from "valibot";
import { admin_ctx } from "#/.server/auth";
import { dataWithError, dataWithSuccess } from "#/.server/toast";
import { resp } from "@/helpers/https";
import type { INpoUpdate } from "@/npo";
import { npo_update } from "@/npo/schema";
import { db } from "$/pg/db";
import { from_target } from "$/pg/queries/fmt";
import { npo_by_slug, npo_update as npo_update_db } from "$/pg/queries/npo";

type Next = { success: string } | { redirect: string };

export const endowUpdate =
  (next: Next): ActionFunction =>
  async (args) => {
    const id = args.context.get(admin_ctx);

    const update: INpoUpdate = await args.request.json();
    const p = safeParse(npo_update, update);
    if (p.issues) return resp.status(400, p.issues[0].message);
    const { target, ...rest } = p.output;

    // check if new slug is already taken (allow npo's own slug)
    if (rest.slug) {
      const res = await npo_by_slug(rest.slug);
      if (res && res.id !== id) {
        return dataWithError(null, `Slug ${rest.slug} is already taken`);
      }
    }

    await npo_update_db(db, id, { ...rest, ...from_target(target) });

    if ("success" in next) {
      return dataWithSuccess(null, next.success);
    }

    return redirect(next.redirect);
  };
