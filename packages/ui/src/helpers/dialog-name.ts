const HEADING = "h1, h2, h3";

/**
 * ref callback for a dialog content element that has no explicit title: keeps
 * `title_id` on its first `h1`–`h3`, following the content as it swaps steps.
 * pass the same id as `ids.title` on `Dialog.Root` — zag then points the
 * content's `aria-labelledby` at it, but only if an element carries that id
 * when it checks, one frame after opening. a dialog with no heading by then
 * stays unnamed.
 *
 * a heading that already has an id of its own is left alone (and doesn't name
 * the dialog): rewriting it would break whatever references it.
 */
export const name_from_heading =
  (title_id: string) => (content: HTMLElement | null) => {
    if (!content) return;
    const sync = () => {
      const heading = content.querySelector(HEADING);
      const holder = content.ownerDocument.getElementById(title_id);
      if (holder === heading) return;
      if (holder && content.contains(holder)) holder.removeAttribute("id");
      if (heading && !heading.id) heading.id = title_id;
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(content, { childList: true, subtree: true });
    return () => observer.disconnect();
  };
