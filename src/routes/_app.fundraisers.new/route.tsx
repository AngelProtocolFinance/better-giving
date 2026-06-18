import { Field as BaseField } from "@ark-ui/react/field";
import { DollarSign } from "lucide-react";
import { useController, useFieldArray } from "react-hook-form";
import { type LinksFunction, useFetcher } from "react-router";
import { useRemixForm } from "remix-hook-form";
import { Field, Label } from "#/components/form";
import { GoalSelector } from "#/components/goal-selector";
import { ImgEditor } from "#/components/img-editor";
import { Increments } from "#/components/increments";
import { RichText, richtext_styles } from "#/components/rich-text";
import { img_spec } from "#/pages/funds/common";
import { Videos } from "#/pages/funds/common/videos";
import { increment_label_max_chars } from "@/schemas";
import type { Route } from "./+types/route";
import { EndowmentSelector } from "./endowment-selector";
import { type FV, MAX_DESCRIPTION_CHAR } from "./schema";

export { ErrorBoundary } from "#/components/error";
export { action, loader } from "./api";
export const links: LinksFunction = () => [...richtext_styles];

export default function Page({ loaderData: endow }: Route.ComponentProps) {
  const fetcher = useFetcher();
  const is_submitting = fetcher.state !== "idle";
  const {
    register,
    watch,
    control,
    trigger,
    resetField,
    handleSubmit,
    formState: { errors },
  } = useRemixForm<FV>({
    reValidateMode: "onSubmit",
    fetcher,
    defaultValues: {
      name: "",
      description: "",
      banner: "",
      logo: "",
      members: endow
        ? [{ id: endow.id, name: endow.name, logo: endow.logo ?? undefined }]
        : [],
      target: {
        type: "smart",
      },
      videos: [],
      increments: [],
      website: "",
    },
  });
  const { field: banner } = useController({ control, name: "banner" });
  const { field: logo } = useController({ control, name: "logo" });
  const { field: members } = useController({
    control,
    name: "members",
  });
  const { field: target_type } = useController({
    control,
    name: "target.type",
  });
  const { field: desc } = useController({
    control,
    name: "description",
  });

  const videos = useFieldArray<Pick<FV, "videos">, "videos">({
    control: control as any,
    name: "videos",
  });

  const increments = useFieldArray({
    control,
    name: "increments",
  });

  const incs = watch("increments");

  const is_uploading = banner.value === "loading" || logo.value === "loading";

  return (
    <div className="w-full xl:container xl:mx-auto px-5">
      <fetcher.Form
        method="POST"
        onSubmit={handleSubmit}
        className="grid bg-card border rounded p-6 my-4 w-full max-w-4xl"
      >
        <h4 className="font-semibold text-sm mb-4">Create your fundraiser</h4>

        {/* Honeypot field - hidden from users but visible to bots */}
        <input
          {...register("website")}
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          style={{
            position: "absolute",
            left: "-9999px",
            width: "1px",
            height: "1px",
            opacity: 0,
          }}
          aria-hidden="true"
        />

        <Field
          {...register("name")}
          label="Name your Fundraiser"
          sub="A great name will attract more donors"
          required
          error={errors.name?.message}
          classes={{ label: "text-left" }}
        />
        <p className="label mt-4 mb-1" data-required>
          Description
        </p>
        <RichText
          ref={desc.ref}
          content={desc.value}
          onChange={desc.onChange}
          placeHolder="A short overview of your fundraiser"
          charLimit={MAX_DESCRIPTION_CHAR}
          classes={{
            field:
              "rich-text-toolbar border text-sm grid grid-rows-[auto_1fr] rounded bg-input p-3 min-h-[15rem]",
            counter: "text-muted-fg",
            error: "text-right",
          }}
          error={
            errors.description?.value?.message ||
            errors.description?.length?.message
          }
        />

        <Videos {...videos} classes="mt-4 mb-8" />

        <EndowmentSelector
          classes="mt-4"
          ref={members.ref}
          values={members.value}
          onChange={members.onChange}
          error={errors.members?.message}
        />

        <p className="mt-6 label">Fundraiser Goal</p>
        <GoalSelector
          classes="mt-2 mb-2"
          value={target_type.value}
          onChange={target_type.onChange}
        />
        {target_type.value === "fixed" && (
          <Field
            {...register("target.value", { shouldUnregister: true })}
            label="How much money do you want to raise?"
            classes="mt-2"
            placeholder="$"
            error={errors.target?.value?.message}
          />
        )}

        <Label className="mt-6 mb-2 label" required>
          Banner
        </Label>
        <ImgEditor
          value={banner.value}
          spec={img_spec([4, 1])}
          on_change={(v) => {
            banner.onChange(v);
            trigger("banner");
          }}
          on_undo={(e) => {
            e.stopPropagation();
            resetField("banner");
          }}
          classes={{
            container: "mb-4",
            dropzone: "aspect-4/1",
          }}
          error={errors.banner?.message}
        />

        <Label className="mt-6 mb-2 label" required>
          Logo
        </Label>
        <ImgEditor
          value={logo.value}
          on_change={(v) => {
            logo.onChange(v);
            trigger("logo");
          }}
          on_undo={(e) => {
            e.stopPropagation();
            resetField("logo");
          }}
          spec={img_spec([1, 1])}
          classes={{
            container: "mb-4",
            dropzone: "aspect-1/1 w-60",
          }}
          error={errors.logo?.message}
        />

        <Increments
          classes="mt-8 mb-10"
          fields={increments.fields}
          onAdd={(val) => {
            if (increments.fields.length >= 4) {
              return alert("You can only have 4 increments");
            }
            increments.append({ value: val, label: "" });
          }}
          onRemove={(idx) => increments.remove(idx)}
          countError={errors.increments?.root?.message}
          field={(idx) => (
            <>
              <BaseField.Root className="grid grid-rows-subgrid row-span-2">
                <div className="relative w-full">
                  <DollarSign
                    size={15}
                    className="text-muted-fg absolute top-1/2 left-2 transform -translate-y-1/2"
                  />
                  <input
                    type="number"
                    {...register(`increments.${idx}.value`)}
                    className="w-full h-full  outline-ring rounded text-sm font-medium bg-input pl-8 pr-4 py-3.5 placeholder:text-muted-fg border disabled:pointer-events-none disabled:bg-muted disabled:text-muted-fg"
                  />
                </div>

                <p className="mt-1 empty:hidden text-left text-xs text-destructive">
                  {errors.increments?.[idx]?.value?.message}
                </p>
              </BaseField.Root>
              <BaseField.Root className="grid grid-rows-subgrid row-span-2">
                <textarea
                  {...register(`increments.${idx}.label`)}
                  rows={2}
                  className="w-full  outline-ring rounded text-sm font-medium bg-input px-4 py-3.5 placeholder:text-muted-fg border disabled:pointer-events-none disabled:bg-muted disabled:text-muted-fg"
                />
                <p
                  data-error={!!errors.increments?.[idx]?.label?.message}
                  className="mt-1 text-left text-xs data-[error='true']:text-destructive"
                >
                  {incs[idx].label.length}/{increment_label_max_chars}
                </p>
              </BaseField.Root>
            </>
          )}
        />

        <Field
          {...register("expiration")}
          label="I want my fundraiser to end on this date "
          type="date"
          classes={{ input: "uppercase" }}
          error={errors.expiration?.message}
          required={false}
        />

        <button
          disabled={is_uploading || is_submitting}
          type="submit"
          className="mt-8 btn btn-primary text-sm font-medium px-4 py-2 justify-self-end"
        >
          Create Fund
        </button>
      </fetcher.Form>
    </div>
  );
}
