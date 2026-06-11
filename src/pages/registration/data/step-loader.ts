import {
  type LoaderFunction,
  type LoaderFunctionArgs,
  redirect,
} from "react-router";
import { safeParse } from "valibot";
import { get_session, to_auth } from "#/.server/auth";
import { routes } from "#/pages/registration/routes";
import type { Reg$IdData } from "#/pages/registration/types";
import { resp } from "@/helpers/https";
import { Progress } from "@/reg/progress";
import { reg_id } from "@/reg/schema";
import { reg_get } from "$/pg/queries/registration";

export const reg_loader: LoaderFunction = async ({ params, request }) => {
  const { user } = await get_session(request);
  if (!user) return to_auth(request);
  const p = safeParse(reg_id, params.reg_id);
  if (p.issues) throw resp.status(400, p.issues[0].message);
  const rid = p.output;
  const reg = await reg_get(rid);
  if (!reg) return { status: 404 };
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
    const { user } = await get_session(request);
    if (!user) return to_auth(request);
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

    if (reg.status === "02" && this_step !== 6) {
      return redirect(`../${6}`);
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
