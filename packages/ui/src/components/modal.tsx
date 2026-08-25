import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import type { PropsWithChildren } from "react";
import { type ModalSize, modal_box } from "../helpers/modal-box";

interface Props extends PropsWithChildren {
  classes?: string;
  /**
   * content-box geometry tier. defaults to `sm` (512px).
   *
   * `"none"` is for a dialog that is not a centered content box — the
   * dashboard's edge-anchored sidebar drawer, its only user. it brings its own
   * position and size through `classes` and takes only the stacking context
   * from here. prefer a tier.
   */
  size?: ModalSize | "none";
  open: boolean;
  onClose: () => void;
}
export function Modal({ size = "sm", ...props }: Props) {
  return (
    <Dialog.Root
      open={props.open}
      onOpenChange={(e) => {
        if (!e.open) props.onClose();
      }}
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-overlay z-scrim data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out" />
        <Dialog.Positioner className="contents">
          <Dialog.Content
            className={`data-[state=open]:animate-popup-in data-[state=closed]:animate-popup-out ${size === "none" ? "z-modal" : modal_box[size]} ${props.classes ?? ""}`}
          >
            {props.children}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
