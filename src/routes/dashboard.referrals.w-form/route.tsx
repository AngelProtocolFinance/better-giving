import { Dialog } from "@base-ui/react/dialog";
import { useNavigate } from "react-router";
import { ExtLink } from "#/components/ext-link";
import type { Route } from "./+types/route";
import type { LoaderData } from "./api";

export { ErrorModal as ErrorBoundary } from "#/components/error";
export { action, loader } from "./api";

export default function Page({ loaderData: data }: Route.ComponentProps) {
  const navigate = useNavigate();

  return (
    <Dialog.Root
      open={true}
      onOpenChange={(open) => {
        if (!open) navigate("..", { replace: true, preventScrollReset: true });
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-fg/30 z-50" />
        <Content {...data} />
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Content(props: LoaderData) {
  return (
    <Dialog.Popup className="z-50 fixed-center grid bg-popover text-popover-fg sm:w-full w-[90vw] sm:max-w-lg rounded p-6">
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
    </Dialog.Popup>
  );
}
