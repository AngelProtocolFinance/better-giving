import { Check, TriangleAlert } from "lucide-react";
import { useEffect, useId } from "react";
import type { FieldErrors } from "react-hook-form";
import { useFetcher } from "react-router";
import { useRemixForm } from "remix-hook-form";
import type { IEmailSubs } from "#/types/hubspot-subscription";

/** what the root action answers: `getValidatedFormData`'s errors on a refused
 *  address, otherwise hubspot's outcome */
type TSubscribeResult =
  | "success"
  | "error"
  | { errors: FieldErrors<IEmailSubs> };

/** the hubspot subscription form, drawn for the marketing footer's surface-deep */
export function NewsletterForm() {
  const fetcher = useFetcher<TSubscribeResult>();
  const input_id = useId();
  const error_id = useId();

  const {
    register,
    setFocus,
    formState: { isSubmitting },
  } = useRemixForm<IEmailSubs>({
    fetcher,
  });

  // the error is read off the latest answer, not formState: react-hook-form
  // takes a server error into its state but never drops it when a later
  // answer comes back clean, so the refusal would sit beside the success line.
  const { data } = fetcher;
  const email_error =
    typeof data === "object" ? data.errors.email?.message : undefined;

  // a refused address puts the caret back in the field. keyed on the answer
  // itself, so a second refusal with the same message refocuses too.
  useEffect(() => {
    if (typeof data === "object" && data.errors.email) setFocus("email");
  }, [data, setFocus]);

  return (
    <fetcher.Form action="/" method="POST" className="grid content-start">
      <label htmlFor={input_id} className="text-xs text-blue-5 mb-1.5">
        Email address
      </label>
      <div className="flex gap-2">
        {/* blue-8, not `border`: on deep that is a hairline (Lc 17.3), and
            blue-8 is the first ramp step that clears a control boundary.
            w-full zeroes the input's min-content width (flex-1 alone keeps
            its ~20-character intrinsic one), which is what lets the row
            narrow with a 320px column instead of widening the page. */}
        <input
          {...register("email")}
          id={input_id}
          autoComplete="email"
          aria-invalid={email_error ? true : undefined}
          aria-describedby={email_error ? error_id : undefined}
          className="min-w-0 w-full flex-1 rounded border border-blue-8 px-3.5 py-3 text-sm text-primary-fg placeholder:text-blue-6 outline-ring"
          placeholder="you@nonprofit.org"
          disabled={isSubmitting}
        />
        <button
          type="submit"
          name="intent"
          value="subscribe"
          className="btn btn-secondary"
          disabled={isSubmitting}
        >
          Subscribe
        </button>
      </div>
      {/* one polite region for every outcome, rendered while empty so the
          first message is a change inside it rather than a node appearing.
          the field's own error is also its description, for when the caret
          is already in it. */}
      <div role="status">
        {email_error && (
          <p
            id={error_id}
            className="text-xs font-medium text-primary-fg mt-1.5 flex items-center gap-1"
          >
            <TriangleAlert className="shrink-0 icon-sm" />
            {email_error}
          </p>
        )}
        {data === "success" && (
          <p className="text-xs text-blue-5 mt-1.5">
            <Check className="stroke-primary-fg inline mr-0.5 icon-sm" />
            The form was sent successfully. By doing so, you have agreed to our
            privacy policy
          </p>
        )}
        {data === "error" && (
          <p className="text-xs font-medium text-primary-fg mt-1.5 flex items-center gap-1">
            <TriangleAlert className="shrink-0 icon-sm" />
            Failed to subscribe
          </p>
        )}
      </div>
    </fetcher.Form>
  );
}
