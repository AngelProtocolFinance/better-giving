import {
  type LoaderFunction,
  type LoaderFunctionArgs,
  redirect,
} from "react-router";
import { safeParse } from "valibot";
import { to_auth } from "#/.server/auth";
import { reg_user } from "#/pages/registration/data/reg-user";
import {
  GRANT_STEP,
  grant_open,
  routes,
  steps,
} from "#/pages/registration/routes";
import type { Reg$IdData } from "#/pages/registration/types";
import { resp } from "@/helpers/https";
import { Progress } from "@/reg/progress";
import { reg_id } from "@/reg/schema";
import { reg_get } from "$/pg/queries/registration";

/** which child of `/register/:reg_id` this request matched. `params` says
 * nothing about it — the layout wraps every child alike — so the grant it hands
 * down has to name the one it is for off the url. */
const matched_child = (request: Request, rid: string): string => {
  const path = new URL(request.url).pathname
    // single fetch asks for the same route at `<path>.data`
    .replace(/_?\.data$/, "")
    .replace(/\/$/, "");
  const segs = path.split("/");
  const i = segs.lastIndexOf(rid);
  return i < 0 ? "" : segs.slice(i + 1).join("/");
};

/** the chrome the grant-open children render inside, so it answers to the same
 * authority they do — and to no more of them than they do. */
export const reg_loader: LoaderFunction = async ({ params, request }) => {
  const p = safeParse(reg_id, params.reg_id);
  if (p.issues) throw resp.status(400, p.issues[0].message);
  const rid = p.output;

  const ru = await reg_user(
    request,
    grant_open.has(matched_child(request, rid))
  );
  if (!ru) return to_auth(request);
  const { user } = ru;

  const reg = await reg_get(rid);
  // a stale reference is a 404 the applicant can read, not a `{status:404}`
  // the chrome below then destructures a missing row out of
  if (!reg) throw resp.status(404, `reg:${rid} not found`);
  // only owner or admin can view
  if (reg.r_id !== user.email && user.role !== "admin") {
    throw resp.status(403);
  }
  return {
    user,
    reg,
  } satisfies Reg$IdData;
};

export const step_loader =
  (this_step: Progress["step"]) =>
  async ({ params, request }: LoaderFunctionArgs) => {
    const ru = await reg_user(request, this_step === GRANT_STEP);
    if (!ru) return to_auth(request);
    const { user } = ru;
    const p = safeParse(reg_id, params.reg_id);
    if (p.issues) throw resp.status(400, p.issues[0].message);
    const rid = p.output;

    const reg = await reg_get(rid);
    if (!reg) throw resp.status(404);
    // only owner or admin can view
    if (reg.r_id !== user.email && user.role !== "admin") {
      throw resp.status(403);
    }

    const r = new Progress(reg);

    if (reg.status === "02" && this_step !== 5) {
      return redirect(`../${steps.summary}`);
    }

    if (reg.status === "03") {
      const to = `../../${routes.success}?name=${reg.o_name}&id=${reg.status_approved_npo_id}`;
      return redirect(to);
    }

    if (this_step > r.step) {
      return redirect(`../${r.step}`);
    }

    return reg;
  };
