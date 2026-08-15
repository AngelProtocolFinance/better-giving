import { valibotResolver } from "@hookform/resolvers/valibot";
import { href, redirect } from "react-router";
import { getValidatedFormData } from "remix-hook-form";
import { safeParse } from "valibot";
import { get_session, to_auth } from "#/.server/auth";
import { reg_cookie } from "#/.server/cookie";
import {
  type IDuplicate,
  identity_payload,
  identity_regnum,
} from "#/pages/registration/identity";
import { resp, search } from "@/helpers/https";
import { msg } from "@/queue";
import type { IRegNew, IRegStartFv } from "@/reg";
import { reg_new, reg_start_fv } from "@/reg/schema";
import { enqueue } from "$/kit/queue";
import { npo_owned_by_regnum } from "$/pg/queries/npo";
import { reg_put } from "$/pg/queries/registration";

export type { IDuplicate };

export const new_application = async (request: Request, fd: FormData) => {
  const { user } = await get_session(request);
  if (!user) return to_auth(request);

  const fv = await getValidatedFormData<IRegStartFv>(
    fd,
    valibotResolver(reg_start_fv)
  );
  if (fv.errors) return fv;

  const cookie = await reg_cookie
    .parse(request.headers.get("cookie"))
    .then((x) => x || {});

  const { referrer } = search(request);

  const payload: IRegNew = identity_payload(fv.data, user.email);

  // user is registering via fresh referral link
  if (referrer) payload.referrer = referrer;

  /* user is registering on his own,
   * but he may have discovered the platform via previous referral
   */
  if (!referrer && cookie.referrer) {
    payload.referrer = cookie.referrer;
  }

  const p = safeParse(reg_new, payload);
  if (p.issues) return resp.status(400, p.issues[0].message);
  const parsed = p.output;

  if (user.email !== parsed.r_id && user.role !== "admin") {
    throw new Response("Unauthorized", { status: 403 });
  }

  // a listing with members behind it is the only one that can invite this
  // registrant in; an unowned one is a stale seed and must not block them.
  const [rn, country] = identity_regnum(parsed);

  const owned = await npo_owned_by_regnum(rn, country);
  if (owned) return { duplicate: { name: owned.name } } satisfies IDuplicate;

  const id = await reg_put(parsed);
  await enqueue(msg("reg-created", { id, r_id: parsed.r_id }));
  cookie.reference = id;

  return redirect(href("/register/:reg_id/1", { reg_id: id }), {
    headers: { "set-cookie": await reg_cookie.serialize(cookie) },
  });
};
