import { Dialog } from "@ark-ui/react/dialog";
import { ChevronRight, X } from "lucide-react";
import type { PropsWithChildren } from "react";
import { Link, useFetcher } from "react-router";
import { RouteModal } from "#/components/route-modal";

type Props = {
  verdict: "approve" | "reject";
};

export function Prompt(props: Props) {
  return (
    <RouteModal>
      <Dialog.Content className="z-50 fixed-center bg-popover sm:w-full w-[90vw] sm:max-w-lg rounded overflow-hidden">
        <Content {...props} />
      </Dialog.Content>
    </RouteModal>
  );
}

function Content({ verdict }: Props) {
  const fetcher = useFetcher({
    key: `tx-request-${verdict}`,
  });

  return (
    <fetcher.Form
      method="POST"
      className="grid content-start justify-items-center"
    >
      <input type="hidden" value={verdict} name="verdict" />
      <div className="relative w-full">
        <p className="sm:text-xl font-bold text-center border-b bg-muted p-5">
          Redeem units request
        </p>
        <Link
          to=".."
          aria-disabled={fetcher.state !== "idle"}
          className="border p-2 rounded absolute top-1/2 right-4 transform -translate-y-1/2 disabled:text-muted-fg"
        >
          <X className="size-4.5 sm:size-6" />
        </Link>
      </div>
      <p className="px-6 pb-4 text-center text-muted-fg mt-4 font-semibold">
        You are about to {verdict} this request.
      </p>

      <div className="flex items-center gap-2 mb-6">
        <Status classes="bg-muted-fg">Pending</Status>
        <ChevronRight size={20} />
        {verdict === "approve" ? (
          <Status classes="bg-success">Approved</Status>
        ) : (
          <Status classes="bg-destructive">Cancelled</Status>
        )}
      </div>

      <div className="p-3 sm:px-8 sm:py-4 flex items-center justify-end gap-4 w-full text-center sm:text-right bg-muted border-t">
        <Link
          replace
          preventScrollReset
          to=".."
          aria-disabled={fetcher.state !== "idle"}
          className="btn-secondary btn text-sm px-8 py-2"
        >
          Back
        </Link>
        <button type="submit" className="btn btn-primary px-8 py-2 text-sm">
          Submit
        </button>
      </div>
    </fetcher.Form>
  );
}

function Status(props: PropsWithChildren<{ classes?: string }>) {
  return (
    <div
      className={`${
        props.classes ?? ""
      } text-primary-fg px-2 py-1 text-xs uppercase rounded`}
    >
      {props.children}
    </div>
  );
}
