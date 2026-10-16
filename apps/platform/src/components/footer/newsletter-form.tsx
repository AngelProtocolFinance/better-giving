import { Check, TriangleAlert } from "lucide-react";
import { useFetcher } from "react-router";
import { useRemixForm } from "remix-hook-form";
import type { IEmailSubs } from "#/types/hubspot-subscription";

/** the hubspot subscription form, drawn for the marketing footer's surface-deep */
export function NewsletterForm() {
  const fetcher = useFetcher<"success" | "error">();

  const {
    register,
    formState: { errors, isSubmitting },
  } = useRemixForm<IEmailSubs>({
    fetcher,
  });

  return (
    <fetcher.Form action="/" method="POST" className="grid content-start">
      <div className="flex gap-2">
        {/* blue-8, not `border`: on deep that is a hairline (Lc 17.3), and
            blue-8 is the first ramp step that clears a control boundary */}
        <input
          {...register("email")}
          aria-label="Email address"
          className="min-w-0 flex-1 rounded border border-blue-8 px-3.5 py-3 text-sm text-primary-fg placeholder:text-blue-6 outline-ring"
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
      {errors.email?.message && (
        <p className="text-xs font-medium text-primary-fg mt-1.5 flex items-center gap-1">
          <TriangleAlert className="shrink-0 icon-sm" />
          {errors.email.message}
        </p>
      )}
      {fetcher.data === "success" && (
        <p className="text-xs text-blue-5 mt-1.5">
          <Check className="stroke-primary-fg inline mr-0.5 icon-sm" />
          The form was sent successfully. By doing so, you have agreed to our
          privacy policy
        </p>
      )}
      {fetcher.data === "error" && (
        <p className="text-xs font-medium text-primary-fg mt-1.5 flex items-center gap-1">
          <TriangleAlert className="shrink-0 icon-sm" />
          Failed to subscribe
        </p>
      )}
    </fetcher.Form>
  );
}
