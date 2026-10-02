import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { type PropsWithChildren, useId, useLayoutEffect, useRef } from "react";
import { name_from_heading } from "../helpers/dialog-name";
import {
  dialog_return_target,
  settle_return_target,
} from "../helpers/ejected-focus";
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
  /**
   * fired once the close animation has finished and the content is unmounted.
   * for a caller that owns this dialog's own mount and has to hold it until
   * then.
   */
  onExitComplete?: () => void;
  /**
   * the dialog's accessible name, read to screen readers only. without it the
   * dialog is named by the first `h1`–`h3` in its content.
   */
  title?: string;
}
export function Modal({ size = "sm", ...props }: Props) {
  const title_id = useId();
  const content_id = useId();
  // zag records its own return target a frame after opening; by then a form
  // that raised this from its submit handler has its submit button disabled
  // and focus on `<body>`
  const return_to = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (props.open) return_to.current = dialog_return_target();
  }, [props.open]);
  return (
    <Dialog.Root
      ids={{ title: title_id, content: content_id }}
      finalFocusEl={() =>
        settle_return_target(
          return_to.current,
          document.getElementById(content_id)
        )
      }
      open={props.open}
      onOpenChange={(e) => {
        if (!e.open) props.onClose();
      }}
      lazyMount
      unmountOnExit
      onExitComplete={props.onExitComplete}
    >
      <Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-overlay z-scrim data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out" />
        <Dialog.Positioner className="contents">
          <Dialog.Content
            ref={props.title ? undefined : name_from_heading(title_id)}
            className={`data-[state=open]:animate-popup-in data-[state=closed]:animate-popup-out ${size === "none" ? "z-modal" : modal_box[size]} ${props.classes ?? ""}`}
          >
            {props.title && (
              <Dialog.Title className="sr-only">{props.title}</Dialog.Title>
            )}
            {props.children}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
