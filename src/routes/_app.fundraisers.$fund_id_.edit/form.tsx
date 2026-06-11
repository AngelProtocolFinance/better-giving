import { Field as BaseField } from "@base-ui/react/field";
import { DollarSign } from "lucide-react";
import type { SubmitHandler } from "react-hook-form";
import { useFetcher } from "react-router";
import { Field, Form as Frm } from "#/components/form";
import { GoalSelector, to_target } from "#/components/goal-selector";
import { ImgEditor } from "#/components/img-editor";
import { Increments } from "#/components/increments";
import { RichText } from "#/components/rich-text";
import { img_spec } from "#/pages/funds/common";
import { Videos } from "#/pages/funds/common/videos";
import type { IFund } from "#/types/fund";
import type { IFundUpdate } from "@/fundraiser";
import { increment_label_max_chars } from "@/schemas";
import { type FV, MAX_DESCRIPTION_CHARS } from "./schema";
import { Slug } from "./slug";
import { use_rhf } from "./use-rhf";

interface Props {
  classes?: string;
  init_slug?: string;
  base_url: string;
}

export function Form({
  classes = "",
  init_slug = "",
  base_url,
  ...props
}: IFund & Props) {
  const fetcher = useFetcher();
  const { dirtyFields: df, ...rhf } = use_rhf(props);

  const is_submitting = fetcher.state !== "idle";
  const is_uploading =
    rhf.banner.value === "loading" || rhf.logo.value === "loading";
  const is_closing_fund = is_submitting && !!(fetcher.json as any).close;

  const onSubmit: SubmitHandler<FV> = async ({ target, ...fv }) => {
    /// BUILD UPDATE ///
    const update: IFundUpdate = {};

    if (df.banner) update.banner = fv.banner;
    if (df.logo) update.logo = fv.logo;

    if (df.target) update.target = to_target(target);

    if (df.name) update.name = fv.name;
    if (df.description) update.description_rich = fv.description.value;
    if (df.slug) update.slug = fv.slug;
    if (df.videos) update.videos = fv.videos.map((v) => v.url);
    if (df.increments) update.increments = fv.increments;

    fetcher.submit(update, {
      method: "PATCH",
      encType: "application/json",
    });
  };

  return (
    <Frm
      onSubmit={rhf.handleSubmit(onSubmit)}
      disabled={is_submitting}
      className={`${classes} pb-4`}
    >
      <Field
        {...rhf.register("name")}
        label="Name"
        required
        error={rhf.errors.name?.message}
        classes={{}}
      />
      <p className="label mt-6 mb-1" data-required>
        Description
      </p>
      <RichText
        ref={rhf.desc.ref}
        content={rhf.desc.value}
        onChange={rhf.desc.onChange}
        placeHolder="A short overview of your fundraiser"
        charLimit={MAX_DESCRIPTION_CHARS}
        classes={{
          field:
            "rich-text-toolbar border text-sm grid grid-rows-[auto_1fr] rounded bg-input p-3 min-h-[15rem]",
          counter: "text-muted-fg",
          error: "text-right",
        }}
        error={
          rhf.errors.description?.value?.message ||
          rhf.errors.description?.length?.message
        }
      />
      <Slug
        base_url={base_url}
        slug_init={init_slug}
        slug_new={rhf.slug}
        slug_field={
          <Field
            {...rhf.register("slug")}
            label="Custom Fundraiser URL"
            classes={{ container: "mt-6" }}
            placeholder="myFundraiser"
            error={rhf.errors.slug?.message}
          />
        }
      />
      <Videos {...rhf.videos} classes="mt-4 mb-8" />
      <p className="label mb-2 mt-4">Logo</p>
      <ImgEditor
        disabled={is_submitting}
        value={rhf.logo.value}
        on_change={(v) => {
          rhf.logo.onChange(v);
          rhf.trigger("logo");
        }}
        on_undo={(e) => {
          e.stopPropagation();
          rhf.resetField("logo");
        }}
        spec={img_spec([1, 1])}
        classes={{ dropzone: "w-80 aspect-1/1" }}
        error={rhf.errors.logo?.message}
      />

      <p className="label mt-6 mb-2">Banner</p>
      <ImgEditor
        disabled={is_submitting}
        value={rhf.banner.value}
        on_change={(v) => {
          rhf.banner.onChange(v);
          rhf.trigger("banner");
        }}
        on_undo={(e) => {
          e.stopPropagation();
          rhf.resetField("banner");
        }}
        spec={img_spec([4, 1])}
        classes={{ dropzone: "w-full aspect-4/1" }}
        error={rhf.errors.banner?.message}
      />

      <p className="label mt-6">
        Fundraiser goal <span className="text-destructive">*</span>
      </p>
      <GoalSelector
        classes="mt-2 mb-2"
        value={rhf.target_type.value}
        onChange={rhf.target_type.onChange}
      />
      {rhf.target_type.value === "fixed" && (
        <Field
          {...rhf.register("target.value", { shouldUnregister: true })}
          label="How much money do you want to raise?"
          classes="mt-2 mb-6"
          placeholder="$"
          error={rhf.errors?.target?.value?.message}
        />
      )}

      <Increments
        classes="mt-8 mb-10"
        fields={rhf.increments.fields}
        onAdd={(val) => {
          if (rhf.increments.fields.length >= 4) {
            return alert("You can only have 4 increments");
          }
          rhf.increments.append({ value: val, label: "" });
        }}
        onRemove={(idx) => rhf.increments.remove(idx)}
        countError={rhf.errors.increments?.root?.message}
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
                  {...rhf.register(`increments.${idx}.value`)}
                  className="w-full h-full  outline-ring rounded text-sm font-medium bg-input pl-8 pr-4 py-3.5 placeholder:text-muted-fg border disabled:pointer-events-none disabled:bg-muted disabled:text-muted-fg"
                />
              </div>

              <p className="mt-1 empty:hidden text-left text-xs text-destructive">
                {rhf.errors.increments?.[idx]?.value?.message}
              </p>
            </BaseField.Root>
            <BaseField.Root className="grid grid-rows-subgrid row-span-2">
              <textarea
                {...rhf.register(`increments.${idx}.label`)}
                rows={2}
                className="w-full  outline-ring rounded text-sm font-medium bg-input px-4 py-3.5 placeholder:text-muted-fg border disabled:pointer-events-none disabled:bg-muted disabled:text-muted-fg"
              />
              <p
                data-error={!!rhf.errors.increments?.[idx]?.label?.message}
                className="mt-1 text-left text-xs data-[error='true']:text-destructive"
              >
                {rhf.incs[idx].label.length}/{increment_label_max_chars}
              </p>
            </BaseField.Root>
          </>
        )}
      />

      <div className="flex items-center justify-end gap-4 mt-4 mb-8">
        <button
          onClick={async () => {
            const fundNameConfirmation = window.prompt(
              "Type the name of this fund to confirm"
            );
            if (!fundNameConfirmation) return;
            if (fundNameConfirmation !== props.name) {
              return window.alert("Fund not closed: name is not confirmed");
            }

            fetcher.submit(
              { close: true },
              { action: ".", method: "POST", encType: "application/json" }
            );
          }}
          disabled={is_closing_fund}
          type="button"
          className="btn btn-destructive text-sm font-medium px-4 py-2 justify-self-end"
        >
          {is_closing_fund ? "Closing.." : "Close fund"}
        </button>
        <button
          disabled={
            !rhf.isDirty || rhf.is_uploading || is_submitting || is_uploading
          }
          type="submit"
          className="btn btn-primary text-sm font-medium px-4 py-2 justify-self-end"
        >
          {is_submitting && !is_closing_fund ? "Updating..." : "Update fund"}
        </button>
      </div>
    </Frm>
  );
}
