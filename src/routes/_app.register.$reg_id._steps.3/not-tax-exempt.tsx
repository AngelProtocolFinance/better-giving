import { NavLink, useFetcher, useNavigate } from "react-router";
import { LoadText } from "#/components/load-text";
import { app_name } from "#/constants/env";
import { steps } from "#/pages/registration/routes";
import type { TRegUpdate } from "@/reg";

interface Props {
  country: string;
  is_fsa_prev?: boolean;
}
export function NotTaxExempt({ country, is_fsa_prev }: Props) {
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const is_loading = fetcher.state !== "idle";

  return (
    <div className="w-full">
      <p className="text-sm text-muted-fg leading-relaxed">
        Great news: Nonprofit Organizations in{" "}
        <span className="font-semibold">{country}</span> can now take advantage
        of {app_name}’s Fiscal Sponsorship service.
      </p>
      <p className="text-sm text-muted-fg leading-relaxed mt-4">
        {app_name} provides fiscal sponsorship services at market-leading cost
        (2.9%) for our partner organizations worldwide to enable them to receive
        tax efficient donations from the USA. Continue to setup your fiscal
        sponsorship agreement.
      </p>
      <div className="grid grid-cols-2 sm:flex gap-2 mt-8">
        <NavLink
          aria-disabled={is_loading}
          to={`../${steps.org_details}`}
          className="py-3 min-w-[8rem] btn-secondary btn text-sm"
        >
          Back
        </NavLink>
        <button
          onClick={async () => {
            if (is_fsa_prev) return navigate(`../${steps.docs}`);
            fetcher.submit(
              { update_type: "org_type", o_type: "other" } satisfies TRegUpdate,
              { method: "PATCH", encType: "application/json" }
            );
          }}
          disabled={is_loading}
          type="button"
          className="py-3 min-w-[8rem] btn btn-primary text-sm"
        >
          <LoadText is_loading={is_loading}>Continue</LoadText>
        </button>
      </div>
    </div>
  );
}
