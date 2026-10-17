import { type ActionFunction, data, redirect } from "react-router";
import { safeParse } from "valibot";
import { admin_ctx } from "#/.server/auth";
import { dataWithSuccess } from "#/.server/toast";
import type { INpoUpdate } from "@/npo";
import { npo_update } from "@/npo/schema";
import { db } from "$/pg/db";
import { from_target } from "$/pg/queries/fmt";
import {
  npo_by_slug,
  npo_update as npo_update_db,
  slug_change_refused,
} from "$/pg/queries/npo";

type Next = { success: string } | { redirect: string };

export const endowUpdate =
  (next: Next): ActionFunction =>
  async (args) => {
    const id = args.context.get(admin_ctx);

    const update: INpoUpdate = await args.request.json();
    const p = safeParse(npo_update, update);
    if (p.issues) {
      return data({ ok: false, error: p.issues[0].message }, { status: 400 });
    }
    const { target, ...rest } = p.output;

    // check if new slug is already taken (allow npo's own slug)
    if (rest.slug) {
      const res = await npo_by_slug(rest.slug);
      if (res && res.id !== id) {
        return data(
          { ok: false, error: `Slug ${rest.slug} is already taken` },
          { status: 400 }
        );
      }
    }

    // transport is json, so an absent key is a form that does not manage the
    // goal — never a clear. clearing sends target "0" (goal-selector's
    // to_target), which still writes.
    try {
      await npo_update_db(db, id, {
        ...rest,
        ...(target !== undefined && from_target(target)),
      });
    } catch (err) {
      if (err instanceof Error && err.message === slug_change_refused) {
        return data({ ok: false, error: err.message }, { status: 400 });
      }
      throw err;
    }

    if ("success" in next) {
      return dataWithSuccess({ ok: true }, next.success);
    }

    return redirect(next.redirect);
  };
