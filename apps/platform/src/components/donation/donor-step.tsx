import { Fieldset } from "@ark-ui/react/fieldset";
import { Combo, Field, FloatingField, FloatingInput } from "@better-giving/ui";
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
    formState: { errors, isSubmitting },
  } = useForm<FV>({
    resolver: valibotResolver(donor_fv),
    values: value,
    criteriaMode: "all",
  });

  const popup_vars: Record<string, string | undefined> = {
    "--form-primary": don.config?.accent_primary,
    "--form-secondary": don.config?.accent_secondary,
    // the option row's highlight is --accent (the semantic token for a
    // selected/highlighted row). re-point it at the tenant accent here, the
    // same move #donation-container makes for --ring — the popup is portaled
    // out of the container, so it inherits neither.
    "--accent": don.config?.accent_secondary,
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
        <FloatingField
          required
          label="First name"
          input={<FloatingInput {...register("first_name")} />}
          error={errors.first_name?.message}
        />
        <FloatingField
          required
          label="Last name"
          input={<FloatingInput {...register("last_name")} />}
          error={errors.last_name?.message}
        />
      </Fieldset.Root>

      <Field
        label="Your employer"
        // promises the email, not a verdict — a match determination is only
        // deliverable for verified employers, so anything stronger is false
        // for most donors
        sub="Many employers match their employees' donations. Add yours and we'll email you what to do next."
        {...register("company_name")}
        error={errors.company_name?.message}
        classes={{}}
        // a real employer, never Better Giving — naming the platform's own
        // nonprofit is what taught donors to enter who they represent
        placeholder="e.g. Microsoft"
      />

      {don.recipient.donor_address_required && (
        <AddressFields
          control={control}
          register={register}
          errors={errors}
          popup_vars={popup_vars}
        />
      )}
      <button
        disabled={isSubmitting}
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
  popup_vars,
}: {
  control: Control<FV>;
  register: UseFormRegister<FV>;
  errors: ReturnType<typeof useForm<FV>>["formState"]["errors"];
  popup_vars: Record<string, string | undefined>;
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
      <Fieldset.Legend className="label mb-3">Your address</Fieldset.Legend>
      <FloatingField
        required
        label="Street"
        input={<FloatingInput {...register("address.street")} />}
        error={errors.address?.street?.message}
      />
      <FloatingField
        required
        label="City"
        input={<FloatingInput {...register("address.city")} />}
        error={errors.address?.city?.message}
      />
      <FloatingField
        required
        label="Zip code"
        input={<FloatingInput {...register("address.zip_code")} />}
        error={errors.address?.zip_code?.message}
      />

      {/* both combos carry an empty placeholder, never none: the floating
          label reads `:placeholder-shown` to decide rest vs. raised. label,
          error and the asterisk belong to the wrapper — the control would
          render a second copy of each. */}
      <FloatingField
        required
        label="Country"
        error={errors.address?.country?.message}
        input={
          <Combo
            required
            ref={country.ref}
            // nested-optional in the schema, and the seam reads undefined as
            // nothing-selected
            value={country.value || undefined}
            on_change={(x) => {
              country.onChange(x ?? "");
              state.onChange("");
            }}
            options={country_names}
            placeholder=""
            popup_vars={popup_vars}
          />
        }
      />
      <FloatingField
        required={is_US}
        label="State"
        error={errors.address?.state?.message}
        input={
          <Combo
            required={is_US}
            ref={state.ref}
            value={state.value || undefined}
            on_change={(x) => state.onChange(x ?? "")}
            options={is_US ? states : []}
            // outside the US there is no list to pick from, so what the donor
            // types is the value
            allow_custom={!is_US}
            placeholder=""
            popup_vars={popup_vars}
          />
        }
      />
    </Fieldset.Root>
  );
}
