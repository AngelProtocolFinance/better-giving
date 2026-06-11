import { Dialog } from "@base-ui/react/dialog";
import { CircleAlert, X } from "lucide-react";
import {
  NavLink,
  useFetcher,
  useNavigate,
  useSearchParams,
} from "react-router";
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
        <Content isDefault={isDefault} isWithHeir={isWithHeir} />
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Content({ isDefault, isWithHeir }: Props) {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";
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
    <Dialog.Popup className="z-50 fixed-center grid content-start justify-items-center bg-popover sm:w-full w-[90vw] sm:max-w-lg rounded overflow-hidden">
      <div className="relative w-full">
        <p className="sm:text-xl font-bold text-center border-b bg-muted p-5">
          Delete payout method
        </p>
        <NavLink
          to=".."
          aria-disabled={isSubmitting}
          className="[&:is(.pending)]:text-muted-fg border p-2 rounded absolute top-1/2 right-4 transform -translate-y-1/2 aria-disabled:text-muted-fg"
        >
          <X className="size-4.5 sm:size-6" />
        </NavLink>
      </div>
      <CircleAlert size={80} className="mt-6 text-destructive" />

      <div className="p-6 text-center text-muted-fg">{message}</div>

      {canProceed && (
        <fetcher.Form
          method="DELETE"
          className="p-3 sm:px-8 sm:py-4 flex items-center justify-end gap-4 w-full text-center sm:text-right bg-muted border-t"
        >
          <NavLink
            to=".."
            aria-disabled={isSubmitting}
            type="button"
            className="btn-secondary btn text-sm px-8 py-2"
          >
            Cancel
          </NavLink>
          <button
            disabled={isSubmitting}
            type="submit"
            className="btn btn-primary px-8 py-2 text-sm"
          >
            Proceed
          </button>
        </fetcher.Form>
      )}
    </Dialog.Popup>
  );
}
