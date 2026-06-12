import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { RichText, richtext_styles } from "#/components/rich-text";
import { to_usd } from "#/helpers/to-usd";
import { Container } from "#/pages/marketplace/container";
import type { Route } from "./+types/route";
import { Milestones } from "./milestones";

export { ErrorBoundary } from "#/components/error";
export { headers, loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export const links: Route.LinksFunction = () => [...richtext_styles];

export default CacheRoute(Page);
function Page({ loaderData: prog }: Route.ComponentProps) {
  return (
    <div className="order-4 lg:col-span-2 w-full h-full grid items-start grid-rows-[auto_auto] gap-8 lg:grid-rows-1 lg:grid-cols-[1fr_auto]">
      <Container title={prog.title} expanded>
        <RichText
          content={{ value: prog.description_rich ?? "" }}
          readOnly
          classes={{ container: "m-6" }}
        />
        {prog.target_raise ? (
          <TargetProgress
            target={prog.target_raise}
            total={prog.total_donations ?? 0}
          />
        ) : null}
      </Container>
      <Milestones
        classes="self-start lg:sticky lg:top-28"
        milestones={prog.milestones}
      />
    </div>
  );
}

type ProgressProps = {
  target: number;
  total: number;
};
function TargetProgress({ target, total }: ProgressProps) {
  const progressPct = Math.min(1, total / target) * 100;
  return (
    <div className="m-6 border-t pt-2 ">
      <div className="mb-2 flex items-center gap-2">
        <p className="font-medium">Target raise:</p>
        <p className="font-bold text-muted-fg">{to_usd(target)}</p>
      </div>
      <div className="h-4 rounded-full bg-muted relative overflow-clip">
        <div
          className="h-full bg-success"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      {total ? (
        <div className="mt-1 flex items-center gap-2 text-sm text-muted-fg">
          <p>Donations received</p>
          <p>{to_usd(total)}</p>
        </div>
      ) : null}
    </div>
  );
}
