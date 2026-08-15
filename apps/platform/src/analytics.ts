import { useEffect, useRef } from "react";

/** pushes a named event to gtm's dataLayer. the container itself is loaded by
 * `use-consent`, in production only and only once the visitor accepts the
 * analytics category — before that the array exists and nothing reads it, so a
 * push is inert rather than a leak. */
export function track(event: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...params });
}

/** pushes one event per successful submission, on the rising edge of
 * react-hook-form's `isSubmitSuccessful` — true only once validation has
 * passed and the submit handler has run, so an attempt the client rejected
 * never counts. pass no `event` and nothing is tracked.
 *
 * takes the form's own state rather than a fetcher's: `fetcher.state` is read
 * at render time, and a form subscribed to no submit-related field never
 * re-renders mid-flight to observe it change.
 *
 * a route's pathname can't stand in for any of this — two forms now share
 * `/register`, and a page-path report can no longer tell starting an
 * application apart from resuming one. */
export function use_submit_event(
  submitted: boolean,
  event: string | undefined,
  params?: () => Record<string, unknown>
) {
  const sent = useRef(false);

  useEffect(() => {
    if (!submitted) {
      // react-hook-form clears the flag when the next submission starts
      sent.current = false;
      return;
    }
    if (sent.current || !event) return;
    sent.current = true;
    track(event, params?.());
  }, [submitted, event, params]);
}
