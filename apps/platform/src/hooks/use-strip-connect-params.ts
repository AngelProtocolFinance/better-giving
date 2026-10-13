import { useEffect } from "react";
import {
  CONNECT_REASON_PARAM,
  CONNECT_RESULT_PARAM,
} from "@/stripe-connect/return";

/** the connect notice is one-shot: once it has rendered, its params leave the
 * address bar so a reload doesn't show it again. through history, not the
 * router — a navigation would rerun the loader and drop the notice while it
 * is being read. */
export function use_strip_connect_params(shown: boolean) {
  useEffect(() => {
    if (!shown) return;
    const url = new URL(window.location.href);
    url.searchParams.delete(CONNECT_RESULT_PARAM);
    url.searchParams.delete(CONNECT_REASON_PARAM);
    // the router keeps its entry key in history.state
    window.history.replaceState(window.history.state, "", url);
  }, [shown]);
}
