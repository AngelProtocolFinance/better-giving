import { Button } from "@better-giving/ui";
import { CircleAlert, X } from "lucide-react";
import { NavLink, useFetcher, useSearchParams } from "react-router";
import { RouteModal } from "#/components/route-modal";
import { search } from "@/helpers/https";

type Props = {
  isDefault: boolean;
  isWithHeir: boolean;
};

export { ErrorModal as ErrorBoundary } from "#/components/error";
export { delete_action as action } from "#/pages/admin/banking/delete-action";
export default function DeletePrompt() {
  const [params] = useSearchParams();
  const { default: d, with_heir } = search(params);
  const isDefault = d === "true";
  const isWithHeir = with_heir === "true";
  return (
    <RouteModal classes="grid content-start justify-items-center bg-popover">
      <Content isDefault={isDefault} isWithHeir={isWithHeir} />
    </RouteModal>
  );
}

function Content({ isDefault, isWithHeir }: Props) {
  const fetcher = useFetcher();
  const is_submitting = fetcher.state !== "idle";
  const [canProceed, message] =
    isDefault && isWithHeir
      ? [false, "Kindly set another payout method as default before deleting"]
      : isDefault
        ? [
            true,
            "Your Nonprofit must have at least one banking connection approved in order to receive payouts. Banking connections that are 'Under Review' do not count towards this and are not eligible to receive payouts until approved. Do you want to proceed with this deletion?",
          ]
        : [true, "Are you sure you want to delete this payment method?"];

  return (
    <>
      <div className="relative w-full">
        <p className="sm:text-xl font-bold text-center border-b bg-muted p-5">
          Delete payout method
        </p>
        <NavLink
          to=".."
          aria-label="Close"
          aria-disabled={is_submitting}
          className="[.pending]:text-muted-fg border p-2 rounded absolute top-1/2 right-4 transform -translate-y-1/2 aria-disabled:text-muted-fg"
        >
          <X className="size-4.5 sm:size-6" />
        </NavLink>
      </div>
      <CircleAlert size={80} className="mt-6 text-destructive" />

      <div className="p-6 text-center text-muted-fg">{message}</div>

      {canProceed && (
        <fetcher.Form method="DELETE" className="actions actions-band">
          <Button variant="secondary" nav to=".." disabled={is_submitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" is_loading={is_submitting}>
            Proceed
          </Button>
        </fetcher.Form>
      )}
    </>
  );
}
