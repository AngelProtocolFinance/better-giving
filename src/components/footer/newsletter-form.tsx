import { Check } from "lucide-react";
import { useFetcher } from "react-router";
import { useRemixForm } from "remix-hook-form";
import type { IEmailSubs } from "#/types/hubspot-subscription";

/** dark-footer variant of the hubspot subscription form */
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
        <input
          {...register("email")}
          aria-label="Email address"
          className="min-w-0 flex-1 rounded-sm bg-primary-fg/10 border border-primary-fg/20 px-3.5 py-3 text-sm text-primary-fg placeholder:text-primary-fg/50 outline-ring"
          placeholder="you@nonprofit.org"
          disabled={isSubmitting}
        />
        <button
          type="submit"
          name="intent"
          value="subscribe"
          className="btn btn-secondary rounded-sm px-4 text-sm"
          disabled={isSubmitting}
        >
          Subscribe
        </button>
      </div>
      <p className="text-xs text-warning mt-1.5 empty:hidden">
        {errors.email?.message}
      </p>
      {fetcher.data === "success" && (
        <p className="text-xs text-primary-fg/80 mt-1.5">
          <Check size={14} className="stroke-success inline mr-0.5" />
          The form was sent successfully. By doing so, you have agreed to our
          privacy policy
        </p>
      )}
      {fetcher.data === "error" && (
        <p className="text-xs text-warning mt-1.5">Failed to subscribe</p>
      )}
    </fetcher.Form>
  );
}
