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
        {/* enter-direction only, on both halves: closing here is a navigation,
            so the route unmounts before ark can flip data-state to closed.
            Modal survives its own exit via unmountOnExit; nothing here can, so
            a `data-[state=closed]:` class would never fire. */}
        <Dialog.Backdrop className="fixed inset-0 bg-overlay z-scrim data-[state=open]:animate-overlay-in" />
        <Dialog.Positioner className="contents">
          <Dialog.Content
            className={`data-[state=open]:animate-popup-in ${modal_box[size]} ${classes}`}
          >
            {children}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
