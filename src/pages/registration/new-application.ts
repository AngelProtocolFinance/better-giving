import { type ActionFunction, href, redirect } from "react-router";
import { safeParse } from "valibot";
import { get_session, to_auth } from "#/.server/auth";
import { reg_cookie } from "#/.server/cookie";
import { is_claimed } from "#/.server/registration/helpers";
import { resp, search } from "@/helpers/https";
import * as reg_created from "@/queue/msgs/reg-created";
import type { INpoClaim, IRegNew } from "@/reg";
import { reg_new } from "@/reg/schema";
import { enqueue } from "$/kit/queue";
import { npo_by_regnum } from "$/pg/queries/npo";
import { reg_put } from "$/pg/queries/registration";

export const new_application: ActionFunction = async ({ request }) => {
  const { user } = await get_session(request);
  if (!user) return to_auth(request);

  const cookie = await reg_cookie
    .parse(request.headers.get("cookie"))
    .then((x) => x || {});

  const { claim: ein, referrer } = search(request);

  const endow = ein ? await npo_by_regnum(ein) : null;
  const claim = endow
    ? ({
        id: endow.id,
        ein: endow.registration_number,
        name: endow.name,
      } satisfies INpoClaim)
    : null;

  const payload: IRegNew = {
    r_id: user.email,
  };

  if (claim) payload.claim = claim;

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

  if (parsed.claim && (await is_claimed(parsed.claim.ein))) {
    throw new Response(`to-claim:${parsed.claim.ein} is already claimed`, {
      status: 400,
    });
  }

  const id = await reg_put(parsed);
  await enqueue(reg_created.to_msg({ id, r_id: parsed.r_id }));
  cookie.reference = id;

  return redirect(href("/register/:reg_id/1", { reg_id: id }), {
    headers: { "set-cookie": await reg_cookie.serialize(cookie) },
  });
};
