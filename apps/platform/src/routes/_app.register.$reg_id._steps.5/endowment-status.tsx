import { CircleAlert, Hourglass } from "lucide-react";
import { useEffect, useRef } from "react";
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
  const conversion_pushed = useRef(false);

  // gtm conversion, keyed to this fetcher completing — not to status "02", so a
  // returning visitor opening an already-submitted application never re-fires it.
  // dataLayer only exists once consent init runs (prod), hence the optional call.
  useEffect(() => {
    if (conversion_pushed.current) return;
    if (fetcher.state !== "idle" || !fetcher.data) return;
    conversion_pushed.current = true;
    window.dataLayer?.push({ event: "nonprofit_signup" });
  }, [fetcher.state, fetcher.data]);

  if (!status || status === "01") {
    return (
      <fetcher.Form
        method="POST"
        className={`grid grid-cols-2 sm:flex gap-2 ${classes}`}
      >
        <Link
          aria-disabled={isSubmitting}
          to={`../${steps.banking}`}
          className="min-w-32 btn-secondary btn"
        >
          Back
        </Link>
        <button
          type="submit"
          disabled={isSubmitting}
          className="min-w-32 btn btn-primary"
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
          className="min-w-32 btn btn-primary"
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
