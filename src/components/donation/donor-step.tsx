import { Fieldset } from "@ark-ui/react/fieldset";
import { valibotResolver } from "@hookform/resolvers/valibot";
import {
  type Control,
  type UseFormRegister,
  useController,
  useForm,
} from "react-hook-form";
import { country_names } from "#/constants/countries";
import { states } from "#/constants/us-states";
import { donor_fv, type IDonorFv as FV } from "@/donations/schema";
import { Combo } from "../combo";
import { Field } from "../form";
import { Field2, Input2 } from "../form/field-2";
import { BackBtn } from "./common/back-btn";
import { use_donation } from "./context";

interface Props {
  value: FV;
  on_back(): void;
  on_change(donor: FV): void;
  classes?: string;
}

export function DonorStep({ classes = "", on_change, value }: Props) {
  const { don, don_set } = use_donation();
  const {
    handleSubmit,
    register,
    control,
    formState: { errors },
  } = useForm<FV>({
    resolver: valibotResolver(donor_fv),
    values: value,
    criteriaMode: "all",
  });

  const opts_style: Record<string, string | undefined> = {
    "--form-primary": don.config?.accent_primary,
    "--form-secondary": don.config?.accent_secondary,
  };

  return (
    <form
      onSubmit={handleSubmit((x) => on_change(x))}
      className={`flex flex-col p-4 @xl/steps:p-8 gap-4 content-start ${classes}`}
    >
      <BackBtn
        className=""
        type="button"
        onClick={() =>
          don_set((x) => ({
            ...x,
            [x.method]: { ...x[x.method], step: "form" },
          }))
        }
      />

      <p className="label">Payment information</p>

      <Field
        label="Your email"
        required
        placeholder="e.g. john@doe.com"
        {...register("email")}
        error={errors.email?.message}
        classes={{}}
        sub="We'll send your donation receipt to this email."
      />

      <Fieldset.Root className="grid grid-cols-2 group gap-4">
        <Fieldset.Legend className="col-span-full label mb-3">
          Your name{" "}
          <span className="block text-sm text-muted-fg font-normal">
            as would appear in your tax receipt and donation record.
          </span>
        </Fieldset.Legend>
        <Field2
          required
          label="First name"
          input={<Input2 {...register("first_name")} />}
          error={errors.first_name?.message}
        />
        <Field2
          required
          label="Last name"
          input={<Input2 {...register("last_name")} />}
          error={errors.last_name?.message}
        />
      </Fieldset.Root>

      <Field
        label="Your company"
        {...register("company_name")}
        error={errors.email?.message}
        classes={{}}
        placeholder="e.g. Better Giving"
      />

      {don.recipient.donor_address_required && (
        <AddressFields
          control={control}
          register={register}
          errors={errors}
          opts_style={opts_style}
        />
      )}
      <button
        className="mt-auto btn btn-form-primary col-span-full"
        type="submit"
      >
        Continue
      </button>
    </form>
  );
}

const US_RE = /united states/i;

/** mounted only when address is required — keeps useController from registering address fields otherwise */
function AddressFields({
  control,
  register,
  errors,
  opts_style,
}: {
  control: Control<FV>;
  register: UseFormRegister<FV>;
  errors: ReturnType<typeof useForm<FV>>["formState"]["errors"];
  opts_style: Record<string, string | undefined>;
}) {
  const { field: country } = useController<FV, "address.country">({
    control,
    name: "address.country",
  });

  const is_US = US_RE.test(country.value || "");

  const { field: state } = useController<FV, "address.state">({
    control,
    name: "address.state",
  });

  return (
    <Fieldset.Root className="grid gap-4 mt-2">
      <Fieldset.Legend className="label -mb-2">Your address</Fieldset.Legend>
      <Field2
        required
        classes="mt-2"
        label="Street"
        input={<Input2 {...register("address.street")} />}
        error={errors.address?.street?.message}
      />
      <Field2
        required
        label="City"
        input={<Input2 {...register("address.city")} />}
        error={errors.address?.city?.message}
      />
      <Field2
        required
        label="Zip code"
        input={<Input2 {...register("address.zip_code")} />}
        error={errors.address?.zip_code?.message}
      />

      <Combo
        variant="inline"
        label="Country"
        required
        ref={country.ref}
        // may be undefined as country is nested optional
        value={country.value ?? ""}
        on_change={(x) => {
          country.onChange(x);
          state.onChange("");
        }}
        options={country_names}
        options_style={opts_style}
        error={errors.address?.country?.message}
        option_disp={(c) => <span>{c}</span>}
      />
      <Combo
        variant="inline"
        label="State"
        required={is_US}
        ref={state.ref}
        // may be undefined as country is nested optional
        value={state.value ?? ""}
        on_change={state.onChange}
        options={is_US ? states : []}
        options_style={opts_style}
        allow_custom={!is_US}
        error={errors.address?.state?.message}
        option_disp={(c) => <span>{c}</span>}
      />
    </Fieldset.Root>
  );
}
