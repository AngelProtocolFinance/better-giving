/** a 4:1 banner that loads with no network, so the img stays mounted rather
 * than falling back to the placeholder */
export const BANNER = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="4"><rect width="16" height="4" fill="teal"/></svg>'
)}`;

/** the Donate links under `root`, by their visible name */
export const donates = (root: Element) =>
  Array.from(root.querySelectorAll("a")).filter(
    (a) => a.textContent === "Donate"
  );

/** a page root's pinned bar (its last child) and the footer's last content
 * line, measured in document coordinates with the page scrolled to its end */
export function pinned_at_end(root: Element) {
  window.scrollTo(0, document.documentElement.scrollHeight);
  const bar = root.lastElementChild as HTMLElement;
  const footer = root.querySelector("footer") as HTMLElement;
  const lines = footer.querySelectorAll("dl, a");
  const y = window.scrollY;
  return {
    footer_bottom: Math.max(
      ...Array.from(lines, (l) => l.getBoundingClientRect().bottom + y)
    ),
    bar_top: bar.getBoundingClientRect().top + y,
    bar_bottom: bar.getBoundingClientRect().bottom + y,
    doc_bottom: document.documentElement.scrollHeight,
  };
}
