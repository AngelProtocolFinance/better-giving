import { Field as BaseField } from "@ark-ui/react/field";
import { DateField, Form as F, Field, Increments } from "@better-giving/ui";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { DollarSign } from "lucide-react";
import { useRef } from "react";
import { useController, useFieldArray, useForm } from "react-hook-form";
import { useFetcher } from "react-router";
import { DonateFrequencies } from "#/components/donate-frequencies";
import { DonateMethods, fill } from "#/components/donate-methods";
import {
  GoalSelector,
  to_form_target,
  to_target,
} from "#/components/goal-selector";
import { ImgEditor } from "#/components/img-editor";
import { RichText } from "#/components/rich-text";
import { img_spec } from "#/pages/funds/common";
import { Videos } from "#/pages/funds/common/videos";
import { to_freq_bools, to_freqs } from "@/helpers/donation";
import type { DonateMethodId, TFrequency } from "@/schemas";
import { increment_label_max_chars } from "@/schemas";
import { CAMPAIGN_TYPES } from "$/pg/schema/campaign";
import { type FV, form_schema } from "./form-schema";
import { SLUG_LOCK_NOTE } from "./persist";

const TYPE_LABEL: Record<(typeof CAMPAIGN_TYPES)[number], string> = {
  year_end: "Year-end",
  emergency: "Emergency",
  building: "Building",
  event: "Event",
  tribute: "Tribute",
  monthly: "Monthly",
  program: "Program",
  other: "Other",
};

export interface IProgramOpt {
  id: string;
  title: string;
}

export interface ICampaignFormInit {
  name: string;
  slug: string;
  campaign_type: string;
  description_pt: string;
  banner: string;
  logo: string;
  videos: string[];
  ends_at: string | null;
  target: string | undefined;
  increments: { label: string; value: string }[];
  donate_methods: DonateMethodId[] | null;
  donate_frequencies: TFrequency[] | null;
  hide_bg_tip: boolean;
  program_id: string | null;
}

interface Props {
  init: ICampaignFormInit;
  programs: IProgramOpt[];
  locked: boolean;
  status: "draft" | "live" | "ended" | null;
  gift_count: number;
  fallback_methods: DonateMethodId[] | null | undefined;
  fallback_frequencies: TFrequency[] | null | undefined;
}

export function CampaignForm({
  init,
  programs,
  locked,
  status,
  gift_count,
  fallback_methods,
  fallback_frequencies,
}: Props) {
  const fetcher = useFetcher<{ error?: string }>();
  const op = useRef<"save" | "publish" | "end" | "delete">("save");
  const ended = status === "ended";

  const {
    register,
    control,
    handleSubmit,
    watch,
    trigger,
    resetField,
    formState: { errors },
  } = useForm<FV>({
    resolver: valibotResolver(form_schema),
    defaultValues: {
      name: init.name,
      slug: init.slug,
      campaign_type: (init.campaign_type || "") as FV["campaign_type"],
      description: { value: init.description_pt },
      banner: init.banner,
      logo: init.logo,
      videos: init.videos.map((url) => ({ url })),
      ends_at: init.ends_at ? init.ends_at.slice(0, 10) : "",
      target: to_form_target(init.target),
      increments: init.increments,
      donate_methods: fill(
        init.donate_methods ?? fallback_methods ?? undefined
      ),
      freqs: to_freq_bools(
        init.donate_frequencies ?? fallback_frequencies ?? undefined
      ),
      hide_bg_tip: init.hide_bg_tip,
      program_id: init.program_id ?? "",
    },
  });

  const { field: banner } = useController({ control, name: "banner" });
  const { field: logo } = useController({ control, name: "logo" });
  const { field: desc } = useController({ control, name: "description" });
  const { field: target_type } = useController({
    control,
    name: "target.type",
  });
  const { field: methods } = useController({ control, name: "donate_methods" });
  const { field: freqs } = useController({ control, name: "freqs" });
  const { field: ends } = useController({ control, name: "ends_at" });
  const videos = useFieldArray({ control, name: "videos" });
  const increments = useFieldArray({ control, name: "increments" });
  const incs = watch("increments");
  const uploading = banner.value === "loading" || logo.value === "loading";
  const busy = uploading || fetcher.state !== "idle";

  const submit = handleSubmit((fv) => {
    const ends_at = fv.ends_at
      ? new Date(`${fv.ends_at}T23:59:59.999Z`).toISOString()
      : "";
    fetcher.submit(
      {
        name: fv.name,
        slug: fv.slug,
        ...(fv.campaign_type ? { campaign_type: fv.campaign_type } : {}),
        description_pt: fv.description.value,
        banner: fv.banner ?? "",
        logo: fv.logo ?? "",
        videos: fv.videos.map((v) => v.url),
        ends_at,
        target: to_target(fv.target),
        increments: fv.increments,
        donate_methods: fv.donate_methods.map((m) => m.id),
        donate_frequencies: to_freqs(fv.freqs),
        hide_bg_tip: fv.hide_bg_tip,
        program_id: fv.program_id ?? "",
        op: op.current,
      },
      { method: "POST", encType: "application/json" }
    );
  });

  const act = (next: typeof op.current) => {
    op.current = next;
    if (next === "end" || next === "delete") {
      fetcher.submit(
        { op: next },
        { method: "POST", encType: "application/json" }
      );
      return;
    }
  };

  return (
    <F onSubmit={submit} className="card grid gap-4">
      {fetcher.data?.error && (
        <p className="text-sm text-destructive-subtle-fg">
          {fetcher.data.error}
        </p>
      )}
      <Field
        {...register("name")}
        label="Name"
        required
        error={errors.name?.message}
      />
      <Field
        {...register("slug")}
        label="Address"
        sub={
          locked
            ? SLUG_LOCK_NOTE
            : "Used in the public link. Letters, numbers, and - . _ ~."
        }
        required
        disabled={locked}
        error={errors.slug?.message}
      />
      <label className="grid gap-1">
        <span className="label">Type</span>
        <select {...register("campaign_type")} className="field-input rounded">
          <option value="">No type</option>
          {CAMPAIGN_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
      <div>
        <p className="label mb-1" data-required>
          Story
        </p>
        <RichText
          ref={desc.ref}
          content={desc.value}
          onChange={desc.onChange}
          placeHolder="The story of this campaign"
          charLimit={8000}
          classes={{
            field:
              "rich-text-toolbar border text-sm grid grid-rows-[auto_1fr] rounded bg-surface p-3 min-h-60",
            counter: "text-gray-11",
            error: "text-right",
          }}
          error={
            errors.description?.value?.message ||
            errors.description?.length?.message
          }
        />
      </div>
      <Videos {...(videos as any)} />
      <div>
        <p className="label mb-2">Hero</p>
        <ImgEditor
          id="campaign-banner"
          ref={banner.ref}
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
          classes={{ container: "mb-2", dropzone: "aspect-4/1" }}
          error={errors.banner?.message}
        />
        <p className="text-sm text-gray-11">
          Leave this empty to use the nonprofit image.
        </p>
      </div>
      <div>
        <p className="label mb-2">Logo</p>
        <ImgEditor
          id="campaign-logo"
          ref={logo.ref}
          value={logo.value}
          spec={img_spec([1, 1])}
          on_change={(v) => {
            logo.onChange(v);
            trigger("logo");
          }}
          on_undo={(e) => {
            e.stopPropagation();
            resetField("logo");
          }}
          classes={{ container: "mb-2", dropzone: "aspect-square w-60" }}
          error={errors.logo?.message}
        />
        <p className="text-sm text-gray-11">
          Leave this empty to use the nonprofit logo.
        </p>
      </div>
      <div>
        <p className="label mb-2">Goal</p>
        <GoalSelector
          value={target_type.value}
          onChange={target_type.onChange}
        />
        {target_type.value === "fixed" && (
          <Field
            {...register("target.value", { shouldUnregister: true })}
            label="Amount to raise"
            classes="mt-2"
            placeholder="$"
            error={errors.target?.value?.message}
          />
        )}
      </div>
      <DateField
        value={ends.value ?? ""}
        onChange={ends.onChange}
        name="ends_at"
        label="End date"
        error={errors.ends_at?.message}
        minToday={status !== "ended"}
      />
      <DonateMethods
        values={methods.value}
        on_change={methods.onChange}
        error={errors.donate_methods?.message}
        ref={methods.ref}
      />
      <DonateFrequencies
        value={freqs.value}
        on_change={freqs.onChange}
        error={errors.freqs?.message}
        ref={freqs.ref}
      />
      <Increments
        fields={increments.fields}
        onAdd={(val) => {
          if (increments.fields.length >= 4) return;
          increments.append({ value: val, label: "" });
        }}
        onRemove={(idx) => increments.remove(idx)}
        countError={errors.increments?.root?.message}
        field={(idx) => (
          <>
            <BaseField.Root className="grid grid-rows-subgrid row-span-2">
              <div className="relative w-full">
                <DollarSign className="text-gray-11 absolute top-1/2 left-2 -translate-y-1/2 icon-md" />
                <input
                  type="number"
                  {...register(`increments.${idx}.value`)}
                  className="w-full h-full outline-ring rounded text-sm font-medium bg-surface pl-8 pr-4 py-3.5 border"
                />
              </div>
              <p className="mt-1 empty:hidden text-left text-xs text-destructive-subtle-fg">
                {errors.increments?.[idx]?.value?.message}
              </p>
            </BaseField.Root>
            <BaseField.Root className="grid grid-rows-subgrid row-span-2">
              <textarea
                {...register(`increments.${idx}.label`)}
                rows={2}
                className="w-full outline-ring rounded text-sm font-medium bg-surface px-4 py-3.5 border"
              />
              <p className="mt-1 text-left text-xs text-gray-11">
                {incs[idx]?.label.length ?? 0}/{increment_label_max_chars}
              </p>
            </BaseField.Root>
          </>
        )}
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register("hide_bg_tip")} />
        Hide the Better Giving tip
      </label>
      <label className="grid gap-1">
        <span className="label">Program</span>
        <select {...register("program_id")} className="field-input rounded">
          <option value="">No program</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-3 justify-end">
        {gift_count === 0 && status && (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => act("delete")}
          >
            Delete
          </button>
        )}
        {status === "live" && (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => act("end")}
          >
            End
          </button>
        )}
        {!ended && (
          <button
            type="submit"
            className="btn"
            disabled={busy}
            onClick={() => {
              op.current = "save";
            }}
          >
            Save
          </button>
        )}
        {!ended && (
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => {
              op.current = "publish";
            }}
          >
            Publish
          </button>
        )}
      </div>
    </F>
  );
}

export const blank_init = (
  methods: DonateMethodId[] | null | undefined,
  frequencies: TFrequency[] | null | undefined,
  hide_bg_tip: boolean
): ICampaignFormInit => ({
  name: "",
  slug: "",
  campaign_type: "",
  description_pt: "",
  banner: "",
  logo: "",
  videos: [],
  ends_at: null,
  target: undefined,
  increments: [],
  donate_methods: methods ?? null,
  donate_frequencies: frequencies ?? null,
  hide_bg_tip,
  program_id: null,
});
