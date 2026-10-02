import { useContext, useEffect, useRef } from "react";
import { UNSAFE_DataRouterStateContext, useLocation } from "react-router";

/**
 * moves focus to the new page's `h1` (else `main`) after a navigation that
 * changes the pathname, so a client-side navigation doesn't leave focus on
 * `<body>` or on the control that triggered it.
 */
export function use_route_focus() {
  const { pathname } = useLocation();
  // the only export carrying the navigation's preventScrollReset (UNSAFE_, not in the docs) —
  // ScrollRestoration reads the same context.
  const prevent_scroll_reset =
    useContext(UNSAFE_DataRouterStateContext)?.preventScrollReset ?? false;
  const prev_pathname = useRef(pathname);

  useEffect(() => {
    if (prev_pathname.current === pathname) return;
    prev_pathname.current = pathname;
    // an in-place swap (tab, filter, closing a route modal) keeps its focus
    if (prevent_scroll_reset) return;
    focus_page();
  }, [pathname, prevent_scroll_reset]);
}

function focus_page() {
  // a route-as-modal moves focus into itself
  if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
  const main = document.querySelector("main");
  if (main?.contains(document.activeElement)) return;

  const target = (main ?? document.body).querySelector("h1") ?? main;
  if (!target) return;
  if (!target.hasAttribute("tabindex")) {
    target.setAttribute("tabindex", "-1");
    // chromium paints the UA focus-visible ring on script focus that follows a keypress
    target.style.outline = "none";
  }
  // ScrollRestoration owns the scroll position
  target.focus({ preventScroll: true });
}
