import type { IPrompt } from "@better-giving/ui";
import { useState } from "react";
import type { FieldNamesMarkedBoolean, UseFormReturn } from "react-hook-form";
import { useFetcher } from "react-router";
import * as v from "valibot";
import { to_text } from "#/components/rich-text";
import { error_prompt } from "#/helpers/error-prompt";
import type { EndowmentProfileUpdate } from "#/types/npo";
import { type FV, schema } from "./schema";

type DirtyFields = FieldNamesMarkedBoolean<FV>;
type Update = Partial<EndowmentProfileUpdate>;

/** each group's fields in the order the form renders them — `trigger`'s
 * focus-on-error walks this order */
export const groups = {
  general: [
    "name",
    "tagline",
    "registration_number",
    "image",
    "logo",
    "card_img",
    "overview",
    "url",
    "slug",
  ],
  organization: [
    "endow_designation",
    "hq_country",
    "active_in_countries",
    "street_address",
  ],
  social_media: ["social_media_urls"],
} as const satisfies Record<string, readonly (keyof FV)[]>;

export type GroupId = keyof typeof groups;

/** a dirty-fields entry is `true`, or an object/array of entries for a nested
 * field — which RHF can leave behind empty once every leaf is reverted */
const is_marked = (x: unknown): boolean =>
  x === true ||
  (typeof x === "object" && x !== null && Object.values(x).some(is_marked));

export const is_group_dirty = (df: DirtyFields, group: GroupId) =>
  groups[group].some((name) => is_marked(df[name]));

type Rhf = Pick<UseFormReturn<FV>, "trigger" | "getValues" | "resetField">;

export function use_edit_npo(
  df: DirtyFields,
  { trigger, getValues, resetField }: Rhf,
  npo_id: number
) {
  const fetcher = useFetcher();
  const [prompt, set_prompt] = useState<IPrompt>();
  const [pending, set_pending] = useState(false);
  const dirty = (name: keyof FV) => is_marked(df[name]);

  /** resolves once the loader has revalidated. that re-seed keeps every dirty
   * value (`keepDirtyValues`), so the fields this PATCH carried are settled
   * here — not on `fetcher.state`, whose submitting/loading renders can batch
   * away entirely */
  const submit = async (update: Update, names: (keyof FV)[]) => {
    await fetcher.submit(update, {
      method: "PATCH",
      action: ".",
      encType: "application/json",
    });
    for (const name of names) {
      resetField(name, { defaultValue: getValues(name) });
    }
  };

  const general = async (): Promise<Update | undefined> => {
    const fv = v.parse(v.pick(schema, groups.general), getValues());
    const update: Update = {};
    if (dirty("slug")) {
      if (fv.slug !== "") {
        const npo = await fetch(`/api/npos/${fv.slug}?fields=id`).then((r) =>
          r.status === 404 ? undefined : r.json()
        );

        if (npo?.id && npo.id !== npo_id) {
          set_prompt({
            type: "error",
            children: `Slug "${fv.slug}" is already taken`,
          });
          return;
        }
      }
      update.slug = fv.slug;
    }
    if (dirty("name")) update.name = fv.name;
    if (dirty("tagline")) update.tagline = fv.tagline;
    if (dirty("registration_number")) {
      update.registration_number = fv.registration_number;
    }
    if (dirty("logo")) update.logo = fv.logo;
    if (dirty("image")) update.image = fv.image;
    if (dirty("card_img")) update.card_img = fv.card_img;
    if (dirty("overview")) {
      update.overview_pt = fv.overview.value;
      update.overview_v2 = to_text(fv.overview.value);
    }
    if (dirty("url")) update.url = fv.url;
    return update;
  };

  const organization = (): Update => {
    const fv = v.parse(v.pick(schema, groups.organization), getValues());
    const update: Update = {};
    if (dirty("endow_designation")) {
      update.endow_designation = fv.endow_designation;
    }
    if (dirty("hq_country")) update.hq_country = fv.hq_country;
    if (dirty("active_in_countries")) {
      update.active_in_countries = fv.active_in_countries;
    }
    if (dirty("street_address")) update.street_address = fv.street_address;
    return update;
  };

  const social_media = (): Update => {
    const fv = v.parse(v.pick(schema, groups.social_media), getValues());
    return { social_media_urls: fv.social_media_urls };
  };

  const run = async (work: () => Promise<void>) => {
    set_pending(true);
    try {
      await work();
    } catch (err) {
      set_prompt(error_prompt(err, { context: "applying profile changes" }));
    } finally {
      set_pending(false);
    }
  };

  const save = async (group: GroupId) => {
    const names = [...groups[group]];
    // before `run`: its pending state disables the fieldset, and a disabled
    // input can't take the focus-on-error
    if (!(await trigger(names, { shouldFocus: true }))) return;
    await run(async () => {
      const update =
        group === "general"
          ? await general()
          : group === "organization"
            ? organization()
            : social_media();
      if (!update) return;
      await submit(update, names.filter(dirty));
    });
  };

  const publish = (published: boolean) =>
    run(() => submit({ published }, ["published"]));

  return {
    save,
    publish,
    busy: pending,
    prompt,
    set_prompt,
  };
}
