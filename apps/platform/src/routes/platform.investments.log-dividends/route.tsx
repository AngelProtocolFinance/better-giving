import { Actions } from "@better-giving/ui";
import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { RouteModal } from "#/components/route-modal";
import { LogForm } from "./log-form";
import { Review } from "./review";
import type { State } from "./types";

export { action } from "./api";

export default function Page() {
  return (
    <RouteModal size="lg" classes="bg-popover">
      <Content />
    </RouteModal>
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

      <Actions band>
        {state.type === "form" ? (
          <Link
            replace
            preventScrollReset
            to=".."
            aria-disabled={fetcher.state !== "idle"}
            className="btn-secondary btn"
          >
            Back
          </Link>
        ) : (
          <button
            disabled={fetcher.state !== "idle"}
            className="btn-secondary btn"
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
          className="btn btn-primary"
        >
          {state.type === "form" ? "Review" : "Submit"}
        </button>
      </Actions>
    </div>
  );
}
