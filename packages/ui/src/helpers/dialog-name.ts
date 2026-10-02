const HEADING = "h1, h2, h3, h4, h5, h6";

/**
 * ref callback for a dialog content element that has no explicit title: keeps
 * `title_id` on its first `h1`–`h3`, following the content as it swaps steps.
 * pass the same id as `ids.title` on `Dialog.Root` — zag then points the
 * content's `aria-labelledby` at it, but only if an element carries that id
 * when it checks, one frame after opening. a dialog with no heading by then
 * stays unnamed: give one that opens loading a `title` instead.
 *
 * a heading that already has an id of its own is left alone (and doesn't name
 * the dialog): rewriting it would break whatever references it.
 *
 * memoize the callback per `title_id`. ark's `Dialog.Content` composes its ref
 * afresh every render, so React detaches and reattaches it on each commit; a
 * reattach to the same element within the commit keeps the one observer. a
 * detach that isn't followed by one removes the id this planted.
 */
export const name_from_heading = (title_id: string) => {
  let content: HTMLElement | null = null;
  let observer: MutationObserver | null = null;
  let planted: HTMLElement | null = null;
  let holds = 0;

  const unplant = () => {
    if (planted?.id === title_id) planted.removeAttribute("id");
    planted = null;
  };
  const sync = () => {
    const heading = content?.querySelector<HTMLElement>(HEADING) ?? null;
    if (heading === planted) return;
    unplant();
    if (heading && !heading.id) {
      heading.id = title_id;
      planted = heading;
    }
  };
  const release = () => {
    observer?.disconnect();
    observer = null;
    unplant();
    content = null;
  };

  return (el: HTMLElement | null) => {
    if (!el) return;
    if (el !== content) {
      release();
      content = el;
      sync();
      observer = new MutationObserver(sync);
      observer.observe(el, { childList: true, subtree: true });
    }
    holds++;
    return () => {
      holds--;
      queueMicrotask(() => {
        if (holds === 0) release();
      });
    };
  };
};
