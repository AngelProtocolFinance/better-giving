import { redirect } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { step_loader } from "#/pages/registration/data/step-loader";
import { next_step, steps } from "#/pages/registration/routes";
import { update_action } from "#/pages/registration/update-action";
import { Progress } from "@/reg/progress";
import type { Route } from "./+types/route";
import { FsaForm } from "./fsa";

export { ErrorBoundary } from "#/components/error";

/** the agreement is the one conditional step. `Progress` lets a 501(c)(3)
 * *past* it — its seeded identity already opens banking — so `step_loader`'s
 * "not that far yet" guard never fires here, and a stale link or a back button
 * would otherwise sit a US applicant in front of an agreement it has no
 * business signing.
 *
 * The invariant: **this route may only ever redirect forward when `Progress`
 * already places the visitor past 3.** `step_loader` owns the backward
 * direction and sends anyone at or below 3 back here, so a forward redirect
 * fired outside that condition fights it and the browser ping-pongs until it
 * gives up — a hard error page with no way out. Gating on the same `step`
 * `step_loader` computed is what keeps the two from ever disagreeing.
 *
 * Legacy rows land below that gate and fall through to the form: `o_type` was
 * set at the old step 3 and `o_ein` at the old step 4, so "501c3 with no EIN"
 * (and "no o_type at all") both sit AT 3. They cannot finish the form —
 * `docs_fsa` requires `"other"` — and that dead end is deliberate; the
 * recovery affordance is a later slice's, not a bespoke escape hatch here. */
export const loader = async (args: Route.LoaderArgs) => {
  const res = await step_loader(3)(args);
  if (res instanceof Response) return res;
  const past_this_step = new Progress(res).step > 3;
  if (res.o_type === "501c3" && past_this_step) {
    return redirect(`../${steps.banking}`);
  }
  return res;
};

export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export const action = update_action(next_step[3]);
export default CacheRoute(Page);

function Page({ loaderData: reg }: Route.ComponentProps) {
  return <FsaForm {...reg} />;
}
