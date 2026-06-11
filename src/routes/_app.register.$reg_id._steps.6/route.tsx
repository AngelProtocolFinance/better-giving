import { Outlet, useFetcher } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { step_loader } from "#/pages/registration/data/step-loader";
import type { Route } from "./+types/route";
import { EndowmentStatus } from "./endowment-status";
import { Step } from "./step";

export { ErrorBoundary } from "#/components/error";
export { submit_action as action } from "./submit-action";
export const loader = step_loader(6);
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();

export default CacheRoute(Page);
function Page({ loaderData: reg }: Route.ComponentProps) {
  const fetcher = useFetcher({ key: "reg-sub" });

  const is_steps_disabled = fetcher.state !== "idle" || reg.status === "02";

  return (
    <div className="grid">
      <h3 className="text-lg mb-2">Summary</h3>
      <p className="text-sm mb-8">
        {reg.status === "04" && //keep bottom margin
          "If you are happy with the details you have submitted, click continue. If you wish to check, click update as required."}
      </p>

      <Step num={1} disabled={is_steps_disabled} />
      <Step num={2} disabled={is_steps_disabled} />
      <Step num={3} disabled={is_steps_disabled} />
      <Step num={4} disabled={is_steps_disabled} />
      <Step num={5} disabled={is_steps_disabled} />

      <EndowmentStatus status={reg.status} classes="mt-6" />
      {/** render prompts */}
      <Outlet />
    </div>
  );
}
