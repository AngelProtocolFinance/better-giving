import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { step_loader } from "#/pages/registration/data/step-loader";
import { next_step } from "#/pages/registration/routes";
import { update_action } from "#/pages/registration/update-action";
import type { Route } from "./+types/route";
import { FsaForm } from "./fsa";
import { NonFsaForm } from "./non-fsa";

export { ErrorBoundary } from "#/components/error";
export const loader = step_loader(4);
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export const action = update_action(next_step[4]);
export default CacheRoute(Page);

function Page({ loaderData: reg }: Route.ComponentProps) {
  if (reg.o_type === "other") {
    return <FsaForm {...reg} />;
  }
  return (
    <NonFsaForm
      claim={!!reg.claim}
      ein={reg.claim?.ein ?? reg.o_ein}
      reg_id={reg.id}
    />
  );
}
