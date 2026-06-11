import { useForm } from "react-hook-form";
import { NavLink, useFetcher } from "react-router";
import { LoadText } from "#/components/load-text";
import { steps } from "#/pages/registration/routes";
import type { TRegUpdate } from "@/reg";
import type { FV } from "./types";

interface Props {
  is_501c3_prev?: boolean;
  is_501c3_init?: boolean;
}

export function PossiblyTaxExempt({ is_501c3_prev, is_501c3_init }: Props) {
  const { handleSubmit, register } = useForm<FV>({
    defaultValues: {
      irs501c3: is_501c3_prev || is_501c3_init ? "yes" : "no",
    },
  });

  const fetcher = useFetcher();
  const is_loading = fetcher.state !== "idle";

  return (
    <form
      className="w-full"
      onSubmit={handleSubmit(async (fv) => {
        fetcher.submit(
          {
            update_type: "org_type",
            o_type: fv.irs501c3 === "yes" ? "501c3" : "other",
          } satisfies TRegUpdate,
          { method: "PATCH", encType: "application/json" }
        );
      })}
    >
      <p className="mt-6">
        Is your organization recognized by the Internal Revenue Service as a
        nonprofit organization exempt under IRC 501(c)(3)?{" "}
      </p>
      <div className="flex gap-4 mt-4 text-sm">
        <label className="radio">
          <input
            type="radio"
            {...register("irs501c3")}
            value={"yes" satisfies FV["irs501c3"]}
            disabled={is_501c3_init}
          />
          Yes
        </label>
        <label className="radio">
          <input
            type="radio"
            {...register("irs501c3")}
            value={"no" satisfies FV["irs501c3"]}
            disabled={is_501c3_init}
          />
          No
        </label>
      </div>

      <div className="grid grid-cols-2 sm:flex gap-2 mt-8">
        <NavLink
          aria-disabled={is_loading}
          to={`../${steps.org_details}`}
          className="py-3 min-w-[8rem] btn-secondary btn text-sm"
        >
          Back
        </NavLink>
        <button
          disabled={is_loading}
          type="submit"
          className="py-3 min-w-[8rem] btn btn-primary text-sm"
        >
          <LoadText is_loading={is_loading}>Continue</LoadText>
        </button>
      </div>
    </form>
  );
}
