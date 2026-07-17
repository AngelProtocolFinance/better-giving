import { valibotResolver } from "@hookform/resolvers/valibot";
import { InfoIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { ExtLink } from "#/components/ext-link";
import { Field, Form } from "#/components/form";
import { type FVAdv, schema_adv } from "./types";

interface Props extends FVAdv {
  classes?: string;
  is_submitting: boolean;
  on_submit: (fv: FVAdv) => void;
}

export function SettingsAdv({
  classes = "",
  on_submit,
  is_submitting,
  ...fv
}: Props) {
  const {
    handleSubmit,
    reset: hookFormReset,
    formState: { isDirty, errors, isSubmitting },
    register,
  } = useForm<FVAdv>({
    resolver: valibotResolver(schema_adv),
    //set new config as default, so user would need to make a change to be able to update again
    values: fv,
  });

  return (
    <Form
      disabled={isSubmitting}
      className={`${classes} @container/configurer bg-card rounded p-4 self-start`}
      onSubmit={handleSubmit((x) => on_submit(x))}
      onReset={(e) => {
        e.preventDefault();
        hookFormReset();
      }}
    >
      <h5>Advanced Settings</h5>
      <p className="mb-4">
        <InfoIcon size={14} className="relative inline bottom-px" />{" "}
        <span className="text-sm">
          Additional setup is required on your embed for these settings to take
          effect.
        </span>
      </p>
      <Field
        sub={
          <p className="text-sm mb-2">
            The URL to redirect to after a successful donation. Donation
            information such as{" "}
            <code className="text-xs text-warning bg-muted p-0.5 rounded">
              donor_name
            </code>
            ,{" "}
            <code className="text-xs text-warning bg-muted p-0.5 rounded">
              donation_amount
            </code>
            ,{" "}
            <code className="text-xs text-warning bg-muted p-0.5 rounded">
              donation_currency
            </code>
            , and{" "}
            <code className="text-xs text-warning bg-muted p-0.5 rounded">
              payment_method
            </code>{" "}
            would be included on the{" "}
            <ExtLink
              className="font-mono text-primary hover:text-primary text-xs"
              href="https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams"
            >
              URLSearchParams
            </ExtLink>{" "}
            upon redirect.
          </p>
        }
        {...register("success_redirect")}
        label="Custom success redirect URL"
        placeholder="e.g. https://yoursite.com/thank-you"
        classes={{ container: "" }}
        error={errors.success_redirect?.message}
      />

      <button
        disabled={!isDirty}
        type="submit"
        className="justify-self-end mt-6 btn btn-primary text-sm px-4 py-2"
      >
        {isSubmitting ? "Saving.." : "Save"}
      </button>
    </Form>
  );
}
