import { Actions, Modal } from "@better-giving/ui";
import { CircleAlert } from "lucide-react";
import { isRouteErrorResponse, useRouteError } from "react-router";
import { GENERIC_ERROR_MESSAGE } from "@/constants/common";

const STATUS_MESSAGES: Record<number, string> = {
  400: "The request was invalid.",
  403: "You don't have permission to do that.",
  404: "The resource you requested was not found.",
  500: "Something went wrong on our end.",
};

export function ErrorModal() {
  // route errors already reported by entry.server handleError; only renders UI.
  const error = useRouteError();

  let message = GENERIC_ERROR_MESSAGE;
  if (isRouteErrorResponse(error)) {
    message =
      STATUS_MESSAGES[error.status] ??
      error.statusText ??
      GENERIC_ERROR_MESSAGE;
  }

  return (
    <Modal
      open={true}
      onClose={() => window.location.reload()}
      classes="grid bg-popover text-popover-fg"
    >
      <div className="px-6 pb-4 text-center mt-6">
        <CircleAlert className="text-destructive mx-auto" size={40} />
        <p className="font-bold mt-3">Something went wrong</p>
        <p className="text-muted-fg text-sm mt-2 text-balance">{message}</p>
      </div>
      <Actions band>
        <button
          onClick={() => window.location.reload()}
          type="button"
          className="inline-block btn btn-primary"
        >
          Ok
        </button>
      </Actions>
    </Modal>
  );
}
