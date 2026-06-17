import { valibotResolver } from "@hookform/resolvers/valibot";
import { and, eq } from "drizzle-orm";
import { type ActionFunction, href } from "react-router";
import { getValidatedFormData } from "remix-hook-form";
import { safeParse } from "valibot";
import { get_session, to_auth } from "#/.server/auth";
import { redirectWithSuccess } from "#/.server/toast";
import { is_resp } from "#/.server/utils";
import { to_text } from "#/components/rich-text";
import type { IFormInvalid } from "#/types/action";
import { report_undefined } from "@/errors/report";
import type { IFund } from "@/fundraiser";
import { resp, search } from "@/helpers/https";
import { $int_gte1 } from "@/schemas";
import { db } from "$/pg/db";
import { fund_put } from "$/pg/queries/fund";
import { npo_get, npos_batch_get } from "$/pg/queries/npo";
import { userxfund_put } from "$/pg/queries/user";
import { user_npo_memberships } from "$/pg/schema/user";
import type { Route } from "./+types/route";
import { evaluate } from "./evaluate";
import { type FV, schema } from "./schema";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const { user } = await get_session(request);
  if (!user) return to_auth(request);
  const { npo: id } = search(request);
  if (id) {
    const npo = await npo_get(+id);
    if (!npo) return resp.status(404);
    return npo;
  }
  return null;
};

export const action: ActionFunction = async ({ request }) => {
  const { user } = await get_session(request);
  if (!user) return to_auth(request);
  const { npo: npo_id } = search(request);
  const fv = await getValidatedFormData<FV>(request, valibotResolver(schema));
  if (fv.errors) return fv;

  const { data: d } = fv;

  // Honeypot validation - reject if the honeypot field is filled
  if (d.website && d.website !== "") {
    console.warn("Honeypot triggered - potential bot submission detected");
    // Return a generic error to avoid revealing the honeypot
    return resp.status(400);
  }

  const evl = await evaluate({
    title: d.name,
    description: to_text(d.description.value),
  }).catch(report_undefined);

  console.info(evl);

  if (evl?.is_spam) {
    if (evl.field === "name") {
      return {
        receivedValues: d,
        errors: { name: { type: "value", message: evl.explanation } },
      } satisfies IFormInvalid<FV>;
    }
    return {
      receivedValues: d,
      errors: {
        description: { value: { type: "value", message: evl.explanation } },
      },
    } satisfies IFormInvalid<FV>;
  }

  const npo_owner = await (async (n) => {
    if (!n) return undefined;
    const p = safeParse($int_gte1, n);
    if (p.issues) return resp.status(400, p.issues[0].message);
    if (user.role !== "admin") {
      const [membership] = await db
        .select({ npo_id: user_npo_memberships.npo_id })
        .from(user_npo_memberships)
        .where(
          and(
            eq(user_npo_memberships.user_id, user.id),
            eq(user_npo_memberships.npo_id, p.output)
          )
        )
        .limit(1);
      if (!membership) return resp.status(403);
    }
    return p.output;
  })(npo_id);

  if (is_resp(npo_owner)) return npo_owner;

  const id = crypto.randomUUID();
  const { expiration: raw_exp, members: ms, target, increments } = d;
  const expiration = raw_exp || undefined;
  const m_ids = ms.map((m) => m.id);
  const members = await npos_batch_get(m_ids);
  for (const m of members) {
    if (!(m.fund_opt_in ?? true) && m.id !== npo_owner)
      throw resp.status(
        400,
        `Endowment ${m} has not opted in to be included in fund`
      );
  }

  // derive top-level donate config from first member NPO
  const first_member = members[0];
  const hide_bg_tip = first_member?.hide_bg_tip ?? false;
  const fund_donate_methods = first_member?.donate_methods ?? undefined;

  const trgt =
    target.type === "none"
      ? `${0}`
      : target.type === "smart"
        ? "smart"
        : `${+target.value}`;

  const fund: IFund = {
    published: false,
    npo_owner: npo_owner || undefined,
    name: d.name,
    description_pt: d.description.value,
    banner: d.banner,
    logo: d.logo,
    videos: d.videos.map((v) => v.url),
    id,
    active: true,
    donation_total_usd: 0,
    target: trgt,
    members: m_ids,
    expiration,
    hide_bg_tip,
    fund_donate_methods,
    creator_id: user.id,
    increments,
    created_at: new Date().toISOString(),
    spam_score: evl ? evl.spam_score : undefined,
  };

  await db.transaction(async (tx) => {
    await fund_put(tx, fund);
    // fund_lookup eliminated — UNIQUE constraint on funds.slug
    await userxfund_put(tx, id, user.id);
  });

  if (npo_owner) {
    const to = href("/admin/:id/funds", { id: npo_owner.toString() });
    return redirectWithSuccess(to, "Fund created");
  }
  return redirectWithSuccess(
    href("/fundraisers/:fund_id/edit", { fund_id: id }),
    "Fund created — publish when ready"
  );
};
