import { CircleAlert } from "lucide-react";
import { isRouteErrorResponse, useRouteError } from "react-router";
import { GENERIC_ERROR_MESSAGE } from "@/constants/common";
import { Modal } from "../modal";

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
      classes="fixed-center z-10 grid bg-popover text-popover-fg sm:w-full w-[90vw] sm:max-w-lg rounded overflow-hidden"
    >
      <div className="px-6 pb-4 text-center mt-6">
        <CircleAlert className="text-destructive mx-auto" size={40} />
        <p className="font-bold mt-3">Something went wrong</p>
        <p className="text-muted-fg text-sm mt-2 text-balance">{message}</p>
      </div>
      <div className="p-3 sm:px-8 sm:py-4 empty:h-12 w-full text-center sm:text-right bg-muted border-t">
        <button
          onClick={() => window.location.reload()}
          type="button"
          className="inline-block btn btn-primary px-8 py-2 max-sm:w-full"
        >
          Ok
        </button>
      </div>
    </Modal>
  );
}
