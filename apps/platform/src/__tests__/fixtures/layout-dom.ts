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

/** elements under `root` pinned to the viewport's bottom edge: fixed or
 * sticky, with a bottom inset */
export const pinned_to_bottom = (root: Element) =>
  Array.from(root.querySelectorAll("*")).filter((el) => {
    const s = getComputedStyle(el);
    return (
      (s.position === "fixed" || s.position === "sticky") && s.bottom !== "auto"
    );
  });

/** the header's Donate, when it shows one */
export const header_donate = (root: Element) =>
  donates(root.querySelector("header") as HTMLElement)[0];

/** scrolls the hero's shown Donate past the top of the viewport, under the
 * pinned header */
export function scroll_past_hero_donate(root: Element) {
  const hero = donates(root.querySelector("main") as HTMLElement).find((a) =>
    a.checkVisibility()
  ) as HTMLElement;
  window.scrollTo(0, hero.getBoundingClientRect().bottom + window.scrollY);
}
