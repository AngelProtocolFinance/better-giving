import { valibotResolver } from "@hookform/resolvers/valibot";
import { useForm } from "react-hook-form";
import { useFetcher } from "react-router";
import * as v from "valibot";
import { CheckField, Form as F } from "#/components/form";

const schema = v.object({
  fund_opt_in: v.boolean(),
});

type FV = v.InferInput<typeof schema>;

interface Props {
  fund_opt_in: boolean;
}

export function FundraiserTab({ fund_opt_in }: Props) {
  const fetcher = useFetcher();

  const {
    reset,
    register,
    handleSubmit,
    formState: { isSubmitting, isDirty },
  } = useForm<FV>({
    resolver: valibotResolver(schema),
    values: {
      fund_opt_in,
    },
  });

  const onSubmit = handleSubmit(async (fv) => {
    fetcher.submit(
      { fund_opt_in: fv.fund_opt_in },
      {
        method: "POST",
        encType: "application/json",
      }
    );
  });

  return (
    <F
      disabled={isSubmitting || fetcher.state !== "idle"}
      onReset={(e) => {
        e.preventDefault();
        reset();
      }}
      onSubmit={onSubmit}
      className="grid content-start gap-6"
    >
      <div>
        <CheckField {...register("fund_opt_in")} classes="font-medium">
          Allow Fundraisers to be created on behalf of your nonprofit
        </CheckField>
        <p className="text-xs sm:text-sm text-muted-fg italic mt-1">
          Fundraising functionality is optional for all Better Giving
          nonprofits. By opting in, people will be able to create fundraisers on
          your behalf. You will receive 100% of funds raised for fundraisers
          specific to your organization, and a percentage split of fundraisers
          involving multiple nonprofits (such as curated giving indexes).
        </p>
      </div>

      <div className="flex gap-3 mt-8">
        <button
          type="reset"
          className="px-6 btn-secondary btn text-sm"
          disabled={!isDirty}
        >
          Reset changes
        </button>
        <button
          type="submit"
          className="px-6 btn btn-primary text-sm"
          disabled={!isDirty}
        >
          Submit changes
        </button>
      </div>
    </F>
  );
}
