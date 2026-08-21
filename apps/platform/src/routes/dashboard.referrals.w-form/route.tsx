import { ExtLink } from "@better-giving/ui";
import { RouteModal } from "#/components/route-modal";
import type { Route } from "./+types/route";
import type { LoaderData } from "./api";

export { ErrorModal as ErrorBoundary } from "#/components/error";
export { action, loader } from "./api";

export default function Page({ loaderData: data }: Route.ComponentProps) {
  return (
    <RouteModal classes="grid bg-popover text-popover-fg p-6">
      <Content {...data} />
    </RouteModal>
  );
}

function Content(props: LoaderData) {
  return (
    <>
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold mb-2">Tax Forms Required</h2>
        <p className="text-muted-fg">
          To receive payout, kindly fill out the appropriate tax form
        </p>
      </div>

      <div className="space-y-4">
        <ExtLink
          href={props.w9_url}
          className="w-full block p-4 border rounded hover:bg-muted transition-colors text-left"
        >
          <div className="font-semibold">For US Residents</div>
          <div className="text-sm text-muted-fg">
            Complete this W-9 tax status form
          </div>
        </ExtLink>

        <ExtLink
          href={props.w8ben_url}
          className="w-full block p-4 border rounded hover:bg-muted transition-colors text-left"
        >
          <div className="font-semibold">For Non-US Residents</div>
          <div className="text-sm text-muted-fg">
            Complete this W-8BEN tax status form
          </div>
        </ExtLink>
      </div>
    </>
  );
}
