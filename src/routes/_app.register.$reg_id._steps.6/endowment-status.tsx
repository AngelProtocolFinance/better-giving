import { CircleAlert, Hourglass } from "lucide-react";
import { Link, useFetcher } from "react-router";
import { LoadText } from "#/components/load-text";
import { steps } from "#/pages/registration/routes";
import type { TStatus } from "@/reg";

type Props = {
  status?: TStatus;
  classes?: string;
};

export function EndowmentStatus({ status, classes = "" }: Props) {
  const fetcher = useFetcher({ key: "reg-sub" });
  const isSubmitting = fetcher.state !== "idle";
  if (!status || status === "01") {
    return (
      <fetcher.Form
        method="POST"
        className={`grid grid-cols-2 sm:flex gap-2 ${classes}`}
      >
        <Link
          aria-disabled={isSubmitting}
          to={`../${steps.banking}`}
          className="py-3 min-w-[8rem] btn-secondary btn text-sm"
        >
          Back
        </Link>
        <button
          type="submit"
          disabled={isSubmitting}
          className="py-3 min-w-[8rem] btn btn-primary text-sm"
        >
          <LoadText is_loading={isSubmitting}>Continue</LoadText>
        </button>
      </fetcher.Form>
    );
  }

  if (status === "04") {
    return (
      <fetcher.Form
        method="POST"
        className={`max-sm:grid text-destructive ${classes} content-start`}
      >
        <p className="mb-6 max-sm:grid justify-items-center gap-2">
          <CircleAlert className="inline relative bottom-px mr-2" size={20} />
          <span className="max-sm:text-center">
            Your nonprofit's application has been rejected.
          </span>
        </p>
        <button
          type="submit"
          disabled={isSubmitting}
          className="min-w-[8rem] btn btn-primary text-sm"
        >
          <LoadText is_loading={isSubmitting}>Resubmit</LoadText>
        </button>
      </fetcher.Form>
    );
  }

  if (status === "02") {
    return (
      <div
        className={`max-sm:grid justify-items-center gap-2 text-muted-fg ${classes}`}
      >
        <Hourglass className="relative bottom-px inline mr-2" size={18} />
        <span className="max-sm:text-center">
          Your application has been submitted for review
        </span>
      </div>
    );
  }
}
