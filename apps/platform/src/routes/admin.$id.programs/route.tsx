import { RmxForm, useRmxForm } from "@better-giving/ui";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import type { Route } from "./+types/route";
import { List } from "./list";

export { action, loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export { ErrorBoundary } from "#/components/error";
export default CacheRoute(Page);

function Page({ loaderData: { programs } }: Route.ComponentProps) {
  const { nav } = useRmxForm();

  return (
    <div className="grid content-start gap-y-6 @lg:gap-y-8 px-6 py-4 md:px-10 md:py-8">
      <RmxForm method="POST" className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Programs</h1>
        <button
          type="submit"
          disabled={nav.state !== "idle"}
          className="btn btn-primary"
        >
          {nav.state === "submitting" ? "Creating..." : "Create Program"}
        </button>
      </RmxForm>
      <List programs={programs} />
    </div>
  );
}
