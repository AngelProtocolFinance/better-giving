import { Dialog } from "@ark-ui/react/dialog";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useFetcher } from "react-router";
import { object } from "valibot";
import { Field } from "#/components/form";
import { RouteModal } from "#/components/route-modal";
import { $req } from "@/schemas";
import type { Route } from "./+types/route";

export { action, loader } from "./api";

function Content({ recipient_name }: { recipient_name: string }) {
  const fetcher = useFetcher({ key: "cancel-subscription" });
  const busy = fetcher.state !== "idle";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: valibotResolver(object({ reason: $req })),
    defaultValues: { reason: "" },
  });

  return (
    <Dialog.Content asChild>
      <form
        onSubmit={handleSubmit((fv) =>
          fetcher.submit(fv, { encType: "application/json", method: "POST" })
        )}
        className="z-50 fixed-center grid content-start justify-items-center bg-popover sm:w-full w-[90vw] sm:max-w-lg rounded overflow-hidden"
      >
        <div className="relative w-full">
          <p className="sm:text-xl font-bold text-center border-b bg-muted p-5">
            Cancel Recurring Donation
          </p>
          <Dialog.CloseTrigger asChild>
            <Link
              aria-disabled={busy}
              preventScrollReset
              replace
              to=".."
              className="border p-2 rounded absolute top-1/2 right-4 transform -translate-y-1/2 aria-disabled:text-muted-fg aria-disabled:pointer-events-none"
            >
              <X className="size-4.5 sm:size-6" />
            </Link>
          </Dialog.CloseTrigger>
        </div>

        <p className="px-6 pb-4 text-muted-fg mt-4">
          <span className="block">
            You are about to cancel your recurring donations to
          </span>
          <span className="font-semibold">{recipient_name}</span>. This action
          cannot be undone. You will no longer be charged for this subscription.
        </p>

        <div className="px-6 pb-4 text-center text-muted-fg" />

        <div className="px-6 w-full pb-6">
          <Field
            {...register("reason")}
            required
            type="textarea"
            label="Reason for cancellation"
            placeholder="Please tell us why you're canceling this recurring donation..."
            error={errors.reason?.message}
          />
        </div>

        <div className="p-4 grid grid-cols-2 gap-4 w-full  sm:text-right bg-muted border-t">
          <Dialog.CloseTrigger asChild>
            <Link
              to={".."}
              aria-disabled={busy}
              className="btn-secondary btn text-sm px-8 py-2"
              preventScrollReset
              replace
            >
              Keep your support
            </Link>
          </Dialog.CloseTrigger>
          <button
            disabled={busy}
            type="submit"
            className="btn btn-destructive px-8 py-2 text-sm"
          >
            {busy ? "Canceling..." : "Cancel"}
          </button>
        </div>
      </form>
    </Dialog.Content>
  );
}

export default function CancelPrompt({
  loaderData: { recipient_name },
}: Route.ComponentProps) {
  return (
    <RouteModal>
      <Content recipient_name={recipient_name} />
    </RouteModal>
  );
}
