import type { ActionFunction } from "react-router";
import { safeParse } from "valibot";
import { get_session, to_auth } from "#/.server/auth";
import { npo_dividend_comps } from "#/.server/npos-dividend-comps";
import { resp } from "@/helpers/https";
import { dividend_log_fv } from "@/nav/schemas";
import { nav_ltd } from "$/pg/queries/nav";

export const action: ActionFunction = async ({ request }) => {
  const { user } = await get_session(request);
  if (!user) return to_auth(request);
  if (user.role !== "admin") return { status: 403 };

  const p = safeParse(dividend_log_fv, await request.json());
  if (p.issues) return resp.status(400, p.issues[0].message);
  const fv = p.output;

  const nav = await nav_ltd();
  const comps = await npo_dividend_comps(+fv.total, nav);

  return resp.json(comps);
};
