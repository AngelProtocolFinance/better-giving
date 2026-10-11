import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import {
  type PropsWithChildren,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
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
   * dialog is named by the first `h1`–`h6` in its content.
   */
  title?: string;
  /**
   * holds the dialog open against Escape and outside clicks, e.g. mid-submit.
   * a `Dialog.CloseTrigger` in the content, or the caller's own close
   * controls, still close it — those stay the caller's to disable.
   */
  busy?: boolean;
  /**
   * where focus goes at close when the element that had it at open has since
   * left the document (a row the dialog's own action removed, a list reload
   * that remounted it), or nothing had it. called once per close, against the
   * DOM as it stands then; never while that element is still connected. an
   * element that isn't focusable on its own (a table cell, a heading) holds a
   * tab stop only while focused. `null` leaves focus to zag, which has no
   * live element left to return to, so it lands on `<body>`.
   */
  returnFocusFallback?: () => HTMLElement | null;
}
export function Modal({ size = "sm", busy = false, ...props }: Props) {
  const title_id = useId();
  const content_id = useId();
  const name_ref = useMemo(() => name_from_heading(title_id), [title_id]);
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
          document.getElementById(content_id),
          props.returnFocusFallback
        )
      }
      open={props.open}
      closeOnEscape={!busy}
      closeOnInteractOutside={!busy}
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
            ref={props.title ? undefined : name_ref}
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
