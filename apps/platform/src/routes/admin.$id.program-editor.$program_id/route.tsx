import { ChevronLeft } from "lucide-react";
import { Link } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { richtext_styles } from "#/components/rich-text";
import { routes } from "#/pages/admin/routes";
import type { Route } from "./+types/route";
import Form from "./form";

export const links: Route.LinksFunction = () => [...richtext_styles];
export { action, loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export { ErrorBoundary } from "#/components/error";
export default CacheRoute(Page);

function Page({ loaderData: program }: Route.ComponentProps) {
  return (
    <div className="grid px-6 py-4 md:px-10 md:py-8">
      <Link
        to={`../${routes.programs}`}
        className="flex items-center gap-2 text-primary hover:text-primary"
      >
        <ChevronLeft />
        <span>Back</span>
      </Link>
      <Form {...program} />
    </div>
  );
}
