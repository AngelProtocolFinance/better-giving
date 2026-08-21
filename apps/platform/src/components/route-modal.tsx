import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { type ModalSize, modal_box } from "@better-giving/ui/helpers";
import type { PropsWithChildren } from "react";
import { useNavigate } from "react-router";

interface IRouteModal extends PropsWithChildren {
  /** navigate target on close — default ".." (parent route) */
  to?: string;
  classes?: string;
  /** content-box geometry tier. defaults to `sm` (512px). */
  size?: ModalSize;
}

/**
 * route-as-modal wrapper. owns Dialog.Root + Portal + Backdrop + Positioner +
 * Content and closes by navigating up. caller passes surface/layout/padding
 * through `classes`; geometry comes from `size`.
 */
export function RouteModal({
  to = "..",
  size = "sm",
  classes = "",
  children,
}: IRouteModal) {
  const navigate = useNavigate();
  return (
    <Dialog.Root
      open={true}
      onOpenChange={(e) => {
        if (!e.open) navigate(to, { replace: true, preventScrollReset: true });
      }}
    >
      <Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-fg/30 z-50" />
        <Dialog.Positioner className="contents">
          <Dialog.Content
            className={`data-[state=open]:animate-popup-in data-[state=closed]:animate-popup-out ${modal_box[size]} ${classes}`}
          >
            {children}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
