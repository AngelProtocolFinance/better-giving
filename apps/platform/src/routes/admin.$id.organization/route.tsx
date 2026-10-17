import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import type { Route } from "./+types/route";
import { Form } from "./form";
import type { FV } from "./schema";

export { action, loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export { ErrorBoundary } from "#/components/error";

export default CacheRoute(Page);
function Page({ loaderData: endow }: Route.ComponentProps) {
  const defaults: FV = {
    logo: endow.logo ?? "",
    name: endow.name,
    registration_number: endow.registration_number ?? "",
    endow_designation: endow.endow_designation,
    hq_country: endow.hq_country,
    slug: endow.slug ?? "",
  };

  // a slug that lands in the loader remounts the form into the locked field
  return (
    <Form
      key={`${endow.id}:${endow.slug ?? ""}`}
      init={defaults}
      id={endow.id}
      base_url={endow.base_url}
    />
  );
}
