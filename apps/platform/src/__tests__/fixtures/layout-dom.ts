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
