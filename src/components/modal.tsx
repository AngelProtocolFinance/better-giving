import { Dialog } from "@base-ui/react/dialog";
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
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-fg/30 z-50 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Popup
          className={`z-50 origin-[var(--transform-origin)] transition-[opacity,scale] duration-200 data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95 ${props.classes}`}
        >
          {props.children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
