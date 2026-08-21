import { type RefObject, useEffect, useState } from "react";

/**
 * container for popups (select/combobox content) rendered inside a dialog.
 *
 * portaled to document.body by default, a popup lands outside any enclosing
 * aria-modal dialog: the dialog hides body children from the a11y tree and
 * paints its backdrop over them, leaving options invisible & unreachable. pass
 * the result to <Portal container={...}> to mount inside the dialog content
 * instead; undefined (no enclosing dialog) keeps the default body portal.
 *
 * @param ref any element rendered inside the popup's trigger subtree
 */
export function use_dialog_container(
  ref: RefObject<HTMLElement | null>
): RefObject<HTMLElement | null> | undefined {
  // new ref object on resolve — Portal only re-reads `container` when its
  // identity changes.
  const [container, set_container] = useState<RefObject<HTMLElement | null>>();
  useEffect(() => {
    const content = ref.current?.closest<HTMLElement>(
      '[data-scope="dialog"][data-part="content"]'
    );
    if (content) set_container({ current: content });
  }, [ref]);
  return container;
}
