/**
 * the open/close motion every anchored popup runs — tooltip, hovercard, the
 * shared select/combo/multi-combo shell, and the app's own popups through the
 * barrel. one spelling: a popup that animates spends this, not a respelling.
 *
 * the only popup that runs the enter half alone is one that unmounts on close,
 * which never reaches `data-[state=closed]`.
 *
 * `prefers-reduced-motion` needs nothing here — the guard is on the speed
 * ladder in `styles/theme.css`, which `--animate-popup-in|out` spend.
 */
export const popup_anim =
  "origin-(--transform-origin) data-[state=open]:animate-popup-in data-[state=closed]:animate-popup-out";

/**
 * the content shell for a tooltip or hovercard. `select` and `toaster` carry
 * theirs inside their own components; this one is shared by two.
 *
 * a panel on the page ink. its hairline is `outline-gray-6`, pinned to the
 * ramp step directly rather than `border`, so it does not follow a
 * `surface-primary` rebinding of `--border`: inside a tinted band every other
 * bordered surface redraws its edge against the fill, and this one keeps
 * drawing it against the page it floats over. `shadow-floating` + `z-floating`
 * are the ledger's `floating` elevation row.
 *
 * the inset is the shell's (`packages/brand/design-system.md` → *A shell owns
 * its padding and radius*). a caller passes its width cap, type size and
 * alignment; never a padding, a fill or an edge. `shell-conformance` sweeps
 * for a respelling.
 */
export const popup_shell =
  "bg-panel outline outline-gray-6 text-gray-12 shadow-floating rounded p-4 z-floating";
