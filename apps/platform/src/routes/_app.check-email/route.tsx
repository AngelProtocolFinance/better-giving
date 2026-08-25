import { useEffect } from "react";
import { href, NavLink, useFetcher } from "react-router";
import { use_counter } from "#/hooks/use-counter";
import type { Route } from "./+types/route";

const MAX_TIME = 30;

export { ErrorBoundary } from "#/components/error";
export { action, loader } from "./api";

export default function Page({ loaderData }: Route.ComponentProps) {
  const { email, redirect_to, stale } = loaderData;
  const fetcher = useFetcher();
  const { counter, reset_counter } = use_counter(MAX_TIME);
  const resent = !!fetcher.data?.time_remaining;
  useEffect(() => {
    if (fetcher.data?.time_remaining) reset_counter();
  }, [fetcher.data, reset_counter]);

  const sending = fetcher.state === "submitting";
  /* the counter starts on mount because arriving here normally means a link
   * was just mailed. an expired one mailed nothing, so the first press is free
   * — every press after it is throttled the same as any other. */
  const throttled = (!stale || resent) && counter > 0;

  return (
    /* the outlet row is a full viewport tall, so the card has to be told both
       where to sit in it and to stop growing into it — left alone it stretches
       edge to edge and its own rows stretch with it, spreading six lines of
       copy over 700px. */
    <div className="grid justify-items-center content-start px-4 py-14">
      <div className="grid w-full max-w-md px-6 sm:px-7 py-7 sm:py-8 bg-card border rounded">
        <h3 className="text-center text-xl sm:text-2xl font-bold">
          {stale ? "That link has expired" : "Check your inbox"}
        </h3>
        <p className="text-center max-sm:text-sm mt-2">
          {stale ? (
            <>
              Send a fresh one to <span className="font-medium">{email}</span>.
            </>
          ) : (
            <>
              We sent a sign-in link to{" "}
              <span className="font-medium">{email}</span>.
            </>
          )}
        </p>

        <fetcher.Form method="POST" className="contents">
          <input readOnly name="email" value={email} className="hidden" />
          <input
            readOnly
            name="redirect"
            value={redirect_to}
            className="hidden"
          />
          <button
            type="submit"
            disabled={sending || throttled}
            className="btn btn-lg btn-primary rounded w-full mt-6 disabled:bg-gray-3 disabled:text-gray-11"
          >
            {sending ? "Sending…" : "Send a new link"}
          </button>
        </fetcher.Form>

        {resent && (
          <p
            role="status"
            className="text-center text-xs sm:text-sm text-success mt-3"
          >
            A new link is on its way.
          </p>
        )}

        {throttled && (
          <p className="text-center text-xs sm:text-sm text-gray-11 mt-3">
            Available again in 00:{String(counter).padStart(2, "0")}
          </p>
        )}

        {/* shown to everyone, always: a link can fail to arrive for reasons this
            screen cannot see or name — throttling among them — and saying so only
            in those cases would make the message itself the signal. unconditional
            keeps it useless as a probe and still gives a real person a way out of
            a dead end.

            it is also the only place the expiry and single use are stated, so
            neither heading needs to repeat them. */}
        <p className="text-center text-xs sm:text-sm text-gray-11 mt-3">
          Links expire in 1 hour and work only once. If yours hasn't arrived,
          check your spam folder or email{" "}
          <a
            className="underline hover:text-gray-12"
            href="mailto:support@better.giving"
          >
            support@better.giving
          </a>
          .
        </p>

        {/* the address is the one thing this screen cannot fix in place — a typo
            here is otherwise a dead end with no link out of it */}
        <NavLink
          to={href("/signup")}
          className="text-center text-xs sm:text-sm text-gray-11 underline hover:text-gray-12 mt-3"
        >
          Wrong address? Start over
        </NavLink>
      </div>
    </div>
  );
}
