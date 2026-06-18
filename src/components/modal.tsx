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
        <Dialog.Backdrop className="fixed inset-0 bg-fg/30 z-50 transition-opacity duration-200 data-[state=closed]:opacity-0" />
        <Dialog.Positioner className="contents">
          <Dialog.Content
            className={`z-50 transition-[opacity,scale] duration-200 data-[state=closed]:opacity-0 data-[state=closed]:scale-95 ${props.classes}`}
          >
            {props.children}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
