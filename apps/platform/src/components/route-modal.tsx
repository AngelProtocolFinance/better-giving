import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import {
  type ModalSize,
  modal_box,
  name_from_heading,
} from "@better-giving/ui/helpers";
import { type PropsWithChildren, useId } from "react";
import { useNavigate } from "react-router";

interface IRouteModal extends PropsWithChildren {
  /** navigate target on close — default ".." (parent route) */
  to?: string;
  classes?: string;
  /** content-box geometry tier. defaults to `sm` (512px). */
  size?: ModalSize;
  /**
   * the dialog's accessible name, read to screen readers only. without it the
   * dialog is named by the first `h1`–`h3` in its content.
   */
  title?: string;
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
  title,
  children,
}: IRouteModal) {
  const navigate = useNavigate();
  const title_id = useId();
  return (
    <Dialog.Root
      ids={{ title: title_id }}
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
            ref={title ? undefined : name_from_heading(title_id)}
            className={`data-[state=open]:animate-popup-in ${modal_box[size]} ${classes}`}
          >
            {title && <Dialog.Title className="sr-only">{title}</Dialog.Title>}
            {children}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
