import { X } from "lucide-react";
import type { PropsWithChildren } from "react";
import { useNavigate } from "react-router";
import { Actions } from "../form/actions";
import { Modal } from "../modal";
import { PromptIcon } from "./prompt-icon";
export interface IPrompt extends PropsWithChildren {
  type?: "success" | "error" | "loading";
  open?: boolean;
  onClose?: () => void;
  isDismissable?: boolean;
}

export function Prompt({
  type,
  children,
  onClose,
  open,
  isDismissable = true,
}: IPrompt) {
  const navigate = useNavigate();
  function close() {
    if (!isDismissable) return;
    if (onClose) return onClose();
    navigate("..", { preventScrollReset: true, replace: true });
  }
  return (
    <Modal
      open={open ?? true}
      onClose={close}
      classes="grid bg-popover text-popover-fg"
    >
      <div className="flex justify-end p-4 border-b">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="btn btn-icon btn-secondary"
        >
          <X size={20} />
        </button>
      </div>

      <PromptIcon type={type} classes="mb-6 sm:mb-8 mt-4 sm:mt-12" />
      <div className="px-6 pb-4 text-center text-gray-11">{children}</div>
      <Actions band>
        <button
          onClick={close}
          type="button"
          className="inline-block btn btn-primary"
        >
          {type === "success" ? "Done" : "Ok"}
        </button>
      </Actions>
    </Modal>
  );
}
