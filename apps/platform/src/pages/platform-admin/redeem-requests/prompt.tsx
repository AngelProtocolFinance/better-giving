import { Actions } from "@better-giving/ui";
import { ChevronRight, X } from "lucide-react";
import {
  type FormEvent,
  type PropsWithChildren,
  useEffect,
  useRef,
} from "react";
import { Link, useFetcher, useParams } from "react-router";
import { RouteModal } from "#/components/route-modal";

type Props = {
  verdict: "approve" | "reject";
};

export function Prompt(props: Props) {
  return (
    <RouteModal classes="bg-panel">
      <Content {...props} />
    </RouteModal>
  );
}

function Content({ verdict }: Props) {
  const { tx_id } = useParams();
  const fetcher = useFetcher({
    key: `tx-request-${tx_id}-${verdict}`,
  });
  // held, not `disabled`: disabling Submit would blur it onto <body>
  const busy = fetcher.state !== "idle";
  const hold = (e: { preventDefault(): void }) => {
    if (busy) e.preventDefault();
  };
  // `busy` lags the submit by a render, so a second press in that gap would
  // send again; the latch closes on the press itself
  const sent = useRef(false);
  useEffect(() => {
    if (fetcher.state === "idle") sent.current = false;
  }, [fetcher.state]);
  const submit_once = (e: FormEvent) => {
    if (sent.current) return e.preventDefault();
    sent.current = true;
  };

  return (
    <fetcher.Form
      method="POST"
      onSubmit={submit_once}
      className="grid content-start justify-items-center"
    >
      <input type="hidden" value={verdict} name="verdict" />
      <div className="relative w-full">
        <p className="sm:text-xl font-bold text-center border-b bg-gray-3 p-5">
          Redeem units request
        </p>
        <Link
          to=".."
          aria-label="Close"
          aria-disabled={busy}
          onClick={hold}
          className="border p-2 rounded absolute top-1/2 right-4 transform -translate-y-1/2 aria-disabled:text-gray-11"
        >
          <X className="size-4.5 sm:size-6" />
        </Link>
      </div>
      <p className="px-6 pb-4 text-center text-gray-11 mt-4 font-semibold">
        You are about to {verdict} this request.
      </p>

      <div className="flex items-center gap-2 mb-6">
        <Status classes="bg-gray-11">Pending</Status>
        <ChevronRight className="icon-xl" />
        {verdict === "approve" ? (
          <Status classes="bg-success">Approved</Status>
        ) : (
          <Status classes="bg-destructive">Cancelled</Status>
        )}
      </div>

      <Actions band>
        <Link
          replace
          preventScrollReset
          to=".."
          aria-disabled={busy}
          onClick={hold}
          className="btn-secondary btn"
        >
          Back
        </Link>
        <button
          aria-disabled={busy}
          aria-busy={busy}
          type="submit"
          className={`btn btn-primary ${busy ? "pending" : ""}`}
        >
          {busy ? "Submitting…" : "Submit"}
        </button>
      </Actions>
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
