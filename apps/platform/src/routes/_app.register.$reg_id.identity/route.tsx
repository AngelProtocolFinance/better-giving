import { useEffect, useState } from "react";
import { NavLink, useFetcher } from "react-router";
import { AlreadyRegistered } from "#/pages/registration/already-registered";
import type { IDuplicate } from "#/pages/registration/identity";
import { IdentityForm } from "#/pages/registration/identity-form";
import type { Route } from "./+types/route";

export { ErrorBoundary } from "#/components/error";
export { action, loader } from "./api";

export default function Page({ loaderData }: Route.ComponentProps) {
  const fetcher = useFetcher<Partial<IDuplicate>>();

  const dup = fetcher.data?.duplicate;
  const [ack, set_ack] = useState(false);
  useEffect(() => {
    if (dup) set_ack(false);
  }, [dup]);

  return (
    <div className="w-full max-w-lg px-5">
      <div className="bg-card border border-gray-6 rounded p-6 sm:p-10">
        <h1 className="text-xl font-bold text-balance">
          Organization type and identity
        </h1>
        <p className="text-gray-11 text-sm mt-1.5 text-pretty">
          Changing your type reopens the steps that depended on the old one.
        </p>

        <IdentityForm
          fetcher={fetcher}
          classes="mt-6"
          submit_text="Save"
          values={loaderData.values}
        >
          <NavLink
            to={`../${loaderData.step}`}
            className="btn btn-secondary w-full mt-3"
          >
            Cancel
          </NavLink>
        </IdentityForm>
      </div>

      {dup && !ack && (
        <AlreadyRegistered name={dup.name} onClose={() => set_ack(true)} />
      )}
    </div>
  );
}
