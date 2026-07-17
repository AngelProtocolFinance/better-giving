import { CircleAlert } from "lucide-react";
import { useFetcher } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { richtext_styles } from "#/components/rich-text";
import type { Route } from "./+types/route";
import { Form } from "./form";
import { PublishBanner } from "./publish-banner";

export { ErrorBoundary } from "#/components/error";
export { action, loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export const links: Route.LinksFunction = () => [...richtext_styles];
export default CacheRoute(Page);

const containerClass = "xl:container xl:mx-auto px-5 mt-8 grid content-start";
function Page({ loaderData }: Route.ComponentProps) {
  const { fund, base_url } = loaderData;
  const fetcher = useFetcher();
  const is_toggling = fetcher.state !== "idle";
  const optimistic = is_toggling ? !fund.published : fund.published;

  if (!fund.active) {
    return (
      <div className="grid content-start place-items-center pt-40 pb-20">
        <CircleAlert size={80} className="text-destructive" />
        <p className="text-xl mt-8">This fund is already closed</p>
      </div>
    );
  }

  return (
    <div className="grid content-start">
      <PublishBanner
        published={optimistic}
        fundId={fund.id}
        onToggle={() =>
          fetcher.submit(
            { published: !fund.published },
            { method: "POST", encType: "application/json" }
          )
        }
        isToggling={is_toggling}
        classes={`${containerClass} mb-4`}
      />
      <Form
        {...fund}
        classes={containerClass}
        base_url={base_url}
        init_slug={fund.slug ?? undefined}
      />
    </div>
  );
}
