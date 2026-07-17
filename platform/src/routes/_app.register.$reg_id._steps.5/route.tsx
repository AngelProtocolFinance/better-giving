import { SquareArrowOutUpRight } from "lucide-react";
import { useState } from "react";
import { NavLink, useFetcher } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { BankDetails, type OnSubmit } from "#/components/bank-details";
import { ExtLink } from "#/components/ext-link";
import { step_loader } from "#/pages/registration/data/step-loader";
import { next_step, steps } from "#/pages/registration/routes";
import { update_action } from "#/pages/registration/update-action";
import type { TRegUpdate } from "@/reg";
import type { Route } from "./+types/route";
import { FormButtons } from "./form-buttons";

export { ErrorBoundary } from "#/components/error";
export const loader = step_loader(5);
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export const action = update_action(next_step[5]);
export default CacheRoute(Page);

function Page({ loaderData: reg }: Route.ComponentProps) {
  const [is_changing, set_is_changing] = useState(false);
  const fetcher = useFetcher();

  const submit: OnSubmit = async (recipient, bank_statement) => {
    const update: TRegUpdate = {
      update_type: "banking",
      o_bank_statement: bank_statement,
      o_bank_id: recipient.id.toString(),
    };
    fetcher.submit(update, {
      method: "PATCH",
      encType: "application/json",
    });
  };

  if (reg.o_bank_id && !is_changing) {
    return (
      <div className="flex flex-col items-start max-sm:items-center">
        <h2 className="text-center sm:text-left text-xl mb-2">
          Banking details
        </h2>

        <p className="mt-6 mb-1">
          <span className="uppercase text-sm font-semibold">account id: </span>
          <span className="text-muted-fg ">{reg.o_bank_id}</span>
        </p>
        <ExtLink
          href={reg.o_bank_statement}
          className="flex items-center gap-2 text-primary hover:text-primary"
        >
          <SquareArrowOutUpRight size={16} />
          <span>Bank statement</span>
        </ExtLink>
        <button
          className="btn btn-destructive px-2 py-1 rounded text-xs mt-2 mb-8"
          type="button"
          onClick={() => set_is_changing(true)}
        >
          change
        </button>

        <div className="grid grid-cols-2 sm:flex gap-2 w-full mt-auto">
          <NavLink
            to={`../${steps.docs}`}
            className="py-3 min-w-32 btn btn-secondary text-sm"
          >
            Back
          </NavLink>
          <NavLink
            to={`../${steps.summary}`}
            className="py-3 min-w-32 btn btn-primary text-sm"
          >
            Continue
          </NavLink>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start max-sm:items-center">
      {is_changing && (
        <button
          className="btn btn-primary px-2 py-1 rounded text-xs mt-2 mb-4"
          type="button"
          onClick={() => set_is_changing(false)}
        >
          cancel
        </button>
      )}
      <h2 className="text-center sm:text-left text-xl mb-4">
        {is_changing ? "Update" : "Setup"} your banking details
      </h2>
      <BankDetails
        verified
        FormButtons={FormButtons}
        onSubmit={submit}
        is_loading={fetcher.state !== "idle"}
      />
    </div>
  );
}
