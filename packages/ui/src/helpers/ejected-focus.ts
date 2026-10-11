/**
 * per disabled `Fieldset`, the control it ejected focus from — held only while
 * that fieldset is disabled. a dialog opening in that window finds focus on
 * `<body>` and reads its return target from here instead.
 *
 * the record isn't tied to the interaction that opened the dialog: a modal
 * opened by any means while focus is on `<body>` (a mouse click in safari,
 * which doesn't focus buttons) during another form's request returns to that
 * form's control rather than to `<body>`. accepted.
 */
const ejected = new Map<HTMLFieldSetElement, HTMLElement>();

export function note_ejected(fieldset: HTMLFieldSetElement, el: HTMLElement) {
  // re-insert so iteration order is ejection order
  ejected.delete(fieldset);
  ejected.set(fieldset, el);
}

export function clear_ejected(fieldset: HTMLFieldSetElement) {
  ejected.delete(fieldset);
}

/** where a dialog opening now should send focus back to when it closes */
export function dialog_return_target(): HTMLElement | null {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) return active;
  const latest = [...ejected.values()].reverse().find((el) => el.isConnected);
  return latest ?? null;
}

/**
 * resolves a dialog's recorded return target at close time. `null` leaves
 * focus to the dialog's default. `content` is the closing dialog's content,
 * still mounted through its exit animation. `fallback` stands in only when
 * there is no recorded target or it has left the document.
 */
export function settle_return_target(
  el: HTMLElement | null,
  content: HTMLElement | null,
  fallback?: () => HTMLElement | null
): HTMLElement | null {
  if (!el?.isConnected) {
    const stand_in = fallback?.() ?? null;
    // a cell or a heading takes focus only through a tabindex
    if (stand_in && stand_in.tabIndex < 0) remove_tab_stop_on_blur(stand_in);
    return stand_in;
  }
  if (!el.matches(":disabled")) return el;
  // a control its still-disabled fieldset ejected is refocused by that
  // fieldset on re-enabling — provided focus is on `<body>` by then, so it is
  // let go of here rather than left in the closing content
  if ([...ejected.values()].includes(el)) {
    const active = el.ownerDocument.activeElement;
    if (active instanceof HTMLElement && content?.contains(active))
      active.blur();
    return null;
  }
  const form = el.closest("form");
  if (!form) return null;
  // the dialog focuses it, with `preventScroll`
  remove_tab_stop_on_blur(form);
  return form;
}

/** `tabindex=-1` only while focused — removing it sooner would unfocus it */
export function focus_without_tab_stop(el: HTMLElement) {
  if (el.hasAttribute("tabindex")) return el.focus();
  remove_tab_stop_on_blur(el);
  el.focus();
}

function remove_tab_stop_on_blur(el: HTMLElement) {
  if (el.hasAttribute("tabindex")) return;
  el.tabIndex = -1;
  el.addEventListener("blur", () => el.removeAttribute("tabindex"), {
    once: true,
  });
}
