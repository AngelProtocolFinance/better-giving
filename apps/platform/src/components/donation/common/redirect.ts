import { useCallback, useEffect, useRef } from "react";
import { parent_origin, post_target } from "./parent-origin";
import type { IDonationDest } from "./return-url";

/** how long the host page gets to act on the `redirect` message before the
 * frame takes itself to the thank-you page.
 *
 * only ever spent on a frame with someone to ask. a script-mode embed
 * (`form-embed.js`) navigates the *top* page and answers with an ack, which
 * stands this fallback down; an ack is the only thing that does, so an older
 * cached copy that predates it falls back on this timer, exactly as it did
 * before. a plain `<iframe src="…/forms/:id">` never waits it out — there is
 * no listener there to wait for. see `ask_host`. */
export const PARENT_GRACE_MS = 1_500;

/** how long a navigation gets to commit before the donor is told it didn't.
 * deliberately generous: assigning `location.href` unloads nothing until the
 * next document arrives, so this has to outlast a slow thank-you page rather
 * than race it. a navigation that lands unloads the page and takes this with
 * it. */
export const NAV_GRACE_MS = 8_000;

/** the host page's answer to our `redirect` message: "I am taking the top
 * page there myself". additive to the embed protocol — nothing requires it. */
export const ACK_TYPE = "redirect_ack";

/** the slice of `window` a post-donation redirect touches. taken as a
 * parameter rather than read off the global so a framed document can be stood
 * in for — `window.top` is unforgeable and can't be redefined. */
export interface IRedirectWin {
  self: unknown;
  top: unknown;
  parent: { postMessage(msg: unknown, target_origin: string): void };
  location: { href: string };
  addEventListener: Window["addEventListener"];
  removeEventListener: Window["removeEventListener"];
}

export interface IRedirectAfterDonation {
  dest: IDonationDest;
  /** the embed's form id — `form-embed.js` drops messages from other forms */
  form_id?: string | null;
  /** origin of the host page, when its embed script told us. validated here
   * rather than trusted: see `parent-origin.ts`. */
  parent_origin?: string | null;
  /** the browser never left this page. the donation already went through, so
   * what's owed the donor is the way out again — never a payment to retry. */
  on_stuck?: () => void;
  win?: IRedirectWin;
}

/** what the fallback is currently waiting on. `off` is terminal. */
type Phase = "host" | "nav" | "off";

/**
 * the donor's donation went through — take them to `dest`.
 *
 * top-level, that's a plain navigation. framed, the host page is asked first
 * when there is one to ask (script-mode embeds navigate the whole tab, which
 * is what a merchant wants) and the frame only takes itself there when no ack
 * comes back. a basic embed has no host to ask and goes straight there.
 *
 * returns a disposer. every wait here outlives the click that started it, so
 * a caller that can unmount must hold onto it — `use_donation_redirect` does
 * that for you.
 */
export function redirect_after_donation(x: IRedirectAfterDonation): () => void {
  const win = x.win ?? window;
  let phase: Phase = "off";
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };

  const arm = () => {
    clear();
    if (phase === "host") timer = setTimeout(leave, PARENT_GRACE_MS);
    if (phase === "nav") timer = setTimeout(stuck, NAV_GRACE_MS);
  };

  function off() {
    phase = "off";
    clear();
    win.removeEventListener("pagehide", on_hide);
    win.removeEventListener("pageshow", on_show);
    win.removeEventListener("message", on_ack);
  }

  function stuck() {
    off();
    x.on_stuck?.();
  }

  function leave() {
    // a merchant's own page may answer X-Frame-Options: DENY. committing that
    // error document in here would fire `pagehide` and take the donor's last
    // message down with it, so their page is only ever offered as a link.
    if (x.dest.is_custom && win.self !== win.top) return stuck();
    phase = "nav";
    arm();
    win.location.href = x.dest.url;
  }

  function on_hide(e: PageTransitionEvent) {
    // `persisted` splits two very different events sharing one name. a real
    // unload is the browser dropping this document and its timers — nothing
    // left to run. a *freeze* is the tab being backgrounded, which is what a
    // wallet sheet taking over on mobile looks like from in here, and that
    // page comes back: cancelling it permanently strands the donor on a form
    // that will never move again.
    if (e.persisted) return clear();
    off();
  }

  const on_show = () => arm();

  function on_ack(e: MessageEvent) {
    const d = e.data as { type?: string; form_id?: string } | null;
    if (d?.type !== ACK_TYPE) return;
    // the host page's origin is the merchant's and unknowable from here, so
    // the form id is the whole check. a forged ack can only cost the donor
    // the self-navigation — the clock below still ends in an answer.
    if (!x.form_id || d.form_id !== x.form_id) return;
    if (phase !== "host") return;
    phase = "nav";
    arm();
  }

  win.addEventListener("pagehide", on_hide);
  win.addEventListener("pageshow", on_show);

  // being framed is not the same question as having someone to ask, and the
  // two only coincide in advanced mode. `parent_origin` is set by
  // `form-embed.js` alone, so without one no script created this frame; with
  // our own receipt as the destination — same-origin, always framable — that
  // leaves nobody to answer and nothing to fear, and the grace below would be
  // spent waiting out a reply that cannot come. the donor spends it reading
  // "Processing...".
  //
  // an older cached script sends no origin either, so a script embed with no
  // `success_redirect` lands the receipt in the frame rather than the tab
  // until that copy turns over. the frame keeps the height the form left it —
  // the receipt route sends no `resize` — which is a worse-looking receipt,
  // not a lost one.
  const ask_host =
    win.self !== win.top &&
    (x.dest.is_custom || !!parent_origin(x.parent_origin));

  if (!ask_host) {
    leave();
    return off;
  }

  win.addEventListener("message", on_ack);
  win.parent.postMessage(
    { type: "redirect", redirect_url: x.dest.url, form_id: x.form_id },
    post_target(x.parent_origin)
  );
  phase = "host";
  arm();
  return off;
}

/**
 * `redirect_after_donation` bound to the caller's lifetime: a component that
 * goes away takes its pending waits — and the state update at the end of them
 * — with it.
 */
export function use_donation_redirect() {
  const cancel_ref = useRef<(() => void) | undefined>(undefined);
  useEffect(
    () => () => {
      cancel_ref.current?.();
    },
    []
  );
  return useCallback((x: IRedirectAfterDonation) => {
    cancel_ref.current?.();
    cancel_ref.current = redirect_after_donation(x);
  }, []);
}
