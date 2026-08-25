import { CircleCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher, useLocation } from "react-router";
import { AlreadyRegistered } from "#/pages/registration/already-registered";
import type { IDuplicate } from "#/pages/registration/identity";
import { IdentityForm } from "#/pages/registration/identity-form";
import type { Route } from "./+types/route";
import { ResumeStrip } from "./resume-strip";

export { ErrorBoundary } from "#/components/error";
export { action, loader } from "./api";

export default function Page({ loaderData }: Route.ComponentProps) {
  // the referrer query must survive the POST — "?index" alone would drop it
  const { search } = useLocation();
  const sp = new URLSearchParams(search);
  sp.set("index", "");
  const action = `?${sp.toString()}`;

  const fetcher = useFetcher<Partial<IDuplicate>>();

  const dup = fetcher.data?.duplicate;
  const [ack, set_ack] = useState(false);
  useEffect(() => {
    if (dup) set_ack(false);
  }, [dup]);

  return (
    <div className="w-full max-w-lg px-5">
      <div className="bg-panel border border-gray-6 rounded p-6 sm:p-10">
        <div className="grid justify-items-center text-center">
          <CircleCheck className="text-success" size={40} />
          <h1 className="text-2xl font-bold mt-3 text-balance">
            Register your nonprofit
          </h1>
          <p className="text-gray-11 mt-1.5 text-pretty">
            Select your organization type to begin.
          </p>
        </div>

        <IdentityForm
          fetcher={fetcher}
          action={action}
          classes="mt-6"
          submit_text="Continue"
          // the resume strip posts from the same url — only the event tells
          // the two intents apart now
          event="reg_start"
          values={{
            o_type: "501c3",
            o_ein: "",
            o_hq_country: "",
            o_registration_number: "",
          }}
        >
          <ResumeStrip prev={loaderData.reference} action={action} />
        </IdentityForm>
      </div>

      {dup && !ack && (
        <AlreadyRegistered name={dup.name} onClose={() => set_ack(true)} />
      )}
    </div>
  );
}
