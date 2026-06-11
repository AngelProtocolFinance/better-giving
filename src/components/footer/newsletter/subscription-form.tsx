import { Check } from "lucide-react";
import { useFetcher } from "react-router";
import { useRemixForm } from "remix-hook-form";
import type { IEmailSubs } from "#/types/hubspot-subscription";

export function SubscriptionForm() {
  const fetcher = useFetcher<"success" | "error">();

  const {
    register,
    formState: { errors, isSubmitting },
  } = useRemixForm<IEmailSubs>({
    fetcher,
  });

  return (
    <fetcher.Form action="/" method="POST" className="grid content-start">
      <div className="grid mb-3">
        <input
          {...register("email")}
          className="field-input p-3 opacity-[.9]"
          placeholder="Enter your email"
          disabled={isSubmitting}
        />
        <p className="field-err mt-0.5 empty:hidden">{errors.email?.message}</p>
        {fetcher.data === "success" && <SuccessMessage classes="mt-0.5" />}
        {fetcher.data === "error" && (
          <p className="field-err mt-0.5">Failed to subscribe</p>
        )}
      </div>
      <button
        type="submit"
        name="intent"
        value="subscribe"
        className="sm:justify-self-start rounded px-5 py-2 btn-primary text-sm font-medium"
        disabled={isSubmitting}
      >
        Subscribe
      </button>
    </fetcher.Form>
  );
}

function SuccessMessage({ classes = "" }) {
  return (
    <p className={`${classes} w-full text-xs`}>
      <Check size={14} className="stroke-success inline bottom-1 mr-0.5" />
      <span className="text-success">
        The form was sent successfully. By doing so, you have agreed to our
        privacy policy
      </span>
    </p>
  );
}
