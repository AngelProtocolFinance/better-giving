import { Dialog } from "@ark-ui/react/dialog";
import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { RouteModal } from "#/components/route-modal";
import type { ILog } from "@/nav";
import type { Route } from "./+types/route";
import { RebalanceForm } from "./form";
import { Review } from "./review";
import type { State } from "./types";

export { action, loader } from "./api";

export default function Page({ loaderData: data }: Route.ComponentProps) {
  return (
    <RouteModal>
      <Dialog.Content className="z-50 fixed-center bg-popover w-[90vw] rounded overflow-hidden">
        <Content {...data} />
      </Dialog.Content>
    </RouteModal>
  );
}

function Content(props: ILog) {
  const [state, setState] = useState<State>({ type: "form" });
  const fetcher = useFetcher();

  return (
    <div>
      {state.type === "form" && (
        <RebalanceForm
          composition={props.composition}
          init={state.data}
          on_submit={(x) => setState({ type: "review", data: x })}
        />
      )}
      {state.type === "review" && <Review fv={state.data} ltd={props} />}

      <div className="p-3 sm:px-8 sm:py-4 flex items-center justify-end gap-4 w-full text-center sm:text-right bg-muted border-t">
        {state.type === "form" ? (
          <Link
            replace
            preventScrollReset
            to=".."
            aria-disabled={fetcher.state !== "idle"}
            className="btn-secondary btn text-sm px-8 py-2"
          >
            Back
          </Link>
        ) : (
          <button
            className="btn-secondary btn text-sm px-8 py-2"
            type="button"
            onClick={() => setState((x) => ({ ...x, type: "form" }))}
          >
            Edit
          </button>
        )}
        <button
          disabled={fetcher.state !== "idle"}
          form={state.type === "form" ? "rebalance-form" : undefined}
          type={state.type === "form" ? "submit" : "button"}
          onClick={
            state.type === "review"
              ? () =>
                  fetcher.submit(state.data.txs, {
                    method: "post",
                    encType: "application/json",
                  })
              : undefined
          }
          className="btn btn-primary px-8 py-2 text-sm"
        >
          {state.type === "form" ? "Review" : "Submit"}
        </button>
      </div>
    </div>
  );
}
