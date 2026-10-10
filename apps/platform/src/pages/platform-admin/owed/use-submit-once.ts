import { useEffect, useRef } from "react";

/**
 * one `on_submit` per request. `submitting` arrives a render after the press,
 * so a second press in that gap would send again; the latch closes on the
 * press itself and opens once the request settles or its answer changes.
 */
export function use_submit_once(submitting: boolean, error?: string) {
  const sent = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `error` is a trigger, not a read — a fresh refusal reopens the latch
  useEffect(() => {
    if (!submitting) sent.current = false;
  }, [submitting, error]);
  return (send: () => void) => {
    if (submitting || sent.current) return;
    sent.current = true;
    send();
  };
}
