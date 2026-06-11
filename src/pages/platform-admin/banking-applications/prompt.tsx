import { Dialog } from "@base-ui/react/dialog";
import { ChevronRight, X } from "lucide-react";
import type { PropsWithChildren } from "react";
import { Link, useFetcher, useNavigate } from "react-router";
import { useRemixForm } from "remix-hook-form";
import type { TStatus } from "@/banking";
import type { IUpdate } from "@/banking/schema";

type Props = {
  verdict: Extract<TStatus, "approved" | "rejected">;
};

export function Prompt(props: Props) {
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
        <Dialog.Popup className="z-50 fixed-center bg-popover sm:w-full w-[90vw] sm:max-w-lg rounded overflow-hidden">
          <Content {...props} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Content({ verdict }: Props) {
  const fetcher = useFetcher({
    key: `banking-application-${verdict}`,
  });
  const {
    register,
    formState: { errors },
  } = useRemixForm<IUpdate>({
    defaultValues: { type: verdict },
    fetcher,
  });
  const reason_id = "reject-reason";

  return (
    <fetcher.Form
      method="POST"
      className="grid content-start justify-items-center"
    >
      <input type="hidden" value={verdict} name="type" />
      <div className="relative w-full">
        <p className="sm:text-xl font-bold text-center border-b bg-muted p-5">
          Banking application
        </p>
        <Link
          to=".."
          aria-disabled={fetcher.state !== "idle"}
          className="border p-2 rounded absolute top-1/2 right-4 transfetcher.Form -translate-y-1/2 disabled:text-muted-fg"
        >
          <X className="size-4.5 sm:size-6" />
        </Link>
      </div>
      <p className="px-6 pb-4 text-center text-muted-fg mt-4 font-semibold">
        You are about to {verdict} this banking application.
      </p>

      {verdict === "approved" ? (
        <div className="px-6 pb-4 text-center text-muted-fg">
          This will immediately payout all pending funds to newly linked bank
          account and is irreversible.
        </div>
      ) : null}

      <div className="flex items-center gap-2 mb-6">
        <Status classes="bg-muted-fg">Under review</Status>
        <ChevronRight size={20} />
        {verdict === "approved" ? (
          <Status classes="bg-success">Approved</Status>
        ) : (
          <Status classes="bg-destructive">Rejected</Status>
        )}
      </div>

      {verdict === "rejected" && (
        <div className="px-6 w-full pb-6 grid">
          <label htmlFor={reason_id} className="label mb-2" data-required>
            Reason for rejection:
          </label>
          <textarea
            {...register("reason")}
            id={reason_id}
            className="field-input"
          />
          <span className="empty:hidden text-xs text-destructive mt-1">
            {errors.reason?.message}
          </span>
        </div>
      )}

      <div className="p-3 sm:px-8 sm:py-4 flex items-center justify-end gap-4 w-full text-center sm:text-right bg-muted border-t">
        <Link
          replace
          preventScrollReset
          to=".."
          aria-disabled={fetcher.state !== "idle"}
          className="btn-secondary btn text-sm px-8 py-2"
        >
          Cancel
        </Link>
        <button
          disabled={fetcher.state !== "idle"}
          type="submit"
          className="btn btn-primary px-8 py-2 text-sm"
        >
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
