import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import type { PropsWithChildren } from "react";

interface Props extends PropsWithChildren {
  classes?: string;
  open: boolean;
  onClose: () => void;
}
export function Modal(props: Props) {
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
        <Dialog.Backdrop className="fixed inset-0 bg-fg/30 z-50 data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out" />
        <Dialog.Positioner className="contents">
          <Dialog.Content
            className={`z-50 data-[state=open]:animate-popup-in data-[state=closed]:animate-popup-out ${props.classes}`}
          >
            {props.children}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
