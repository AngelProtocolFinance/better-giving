import { Button } from "@better-giving/ui";
import { CircleAlert, Hourglass } from "lucide-react";
import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { steps } from "#/pages/registration/routes";
import type { TStatus } from "@/reg";

type Props = {
  status?: TStatus;
  classes?: string;
};

export function EndowmentStatus({ status, classes = "" }: Props) {
  const fetcher = useFetcher({ key: "reg-sub" });
  const is_submitting = fetcher.state !== "idle";
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
      <fetcher.Form method="POST" className={`actions ${classes}`}>
        <Button
          variant="secondary"
          to={`../${steps.banking}`}
          disabled={is_submitting}
          className="min-w-32"
        >
          Back
        </Button>
        <Button
          variant="primary"
          type="submit"
          is_loading={is_submitting}
          className="min-w-32"
        >
          Continue
        </Button>
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
        <Button
          variant="primary"
          type="submit"
          is_loading={is_submitting}
          className="min-w-32"
        >
          Resubmit
        </Button>
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
