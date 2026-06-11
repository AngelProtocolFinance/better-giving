import { Dialog } from "@base-ui/react/dialog";
import { useState } from "react";
import { Link, useFetcher, useNavigate } from "react-router";
import { LogForm } from "./log-form";
import { Review } from "./review";
import type { State } from "./types";

export { action } from "./api";

export default function Page() {
  const navigate = useNavigate();
  return (
    <Dialog.Root
      open={true}
      onOpenChange={(open) => {
        if (!open) navigate("..", { preventScrollReset: true, replace: true });
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-fg/30 z-50" />
        <Dialog.Popup className="z-50 fixed-center bg-popover w-full max-w-3xl max-h-[90vh] rounded overflow-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border">
          <Content />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Content() {
  const [state, setState] = useState<State>({ type: "form" });
  const fetcher = useFetcher();

  return (
    <div>
      {state.type === "form" && (
        <LogForm
          init={state.fv}
          on_submit={(x, y) =>
            setState({ type: "review", fv: x, per_npo_credit_usd: y })
          }
        />
      )}
      {state.type === "review" && (
        <Review
          amount={+state.fv.total}
          per_npo_credit_usd={state.per_npo_credit_usd}
        />
      )}

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
            disabled={fetcher.state !== "idle"}
            className="btn-secondary btn text-sm px-8 py-2"
            type="button"
            onClick={() => setState((x) => ({ ...x, type: "form" }))}
          >
            Edit
          </button>
        )}
        <button
          disabled={fetcher.state !== "idle"}
          form={state.type === "form" ? "log-interest-form" : undefined}
          type={state.type === "form" ? "submit" : "button"}
          onClick={
            state.type === "review"
              ? () =>
                  fetcher.submit(state.fv, {
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
