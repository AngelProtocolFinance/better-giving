import type { IPrompt } from "@better-giving/ui";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { useEffect, useState } from "react";
import {
  type FieldValues,
  type UseFormReturn,
  useController,
  useForm,
  useWatch,
} from "react-hook-form";
import * as v from "valibot";
import { to_text } from "#/components/rich-text";
import { type FV, schema } from "./schema";
import { type Update, use_save } from "./use-save";

type SetPrompt = (p: IPrompt) => void;

/** each group's fields in the order the form renders them — `trigger`'s
 * focus-on-error walks this order, not the order they register in */
const general_fields = [
  "name",
  "tagline",
  "registration_number",
  "image",
  "logo",
  "card_img",
  "overview",
  "url",
  "slug",
] as const satisfies (keyof FV)[];

const organization_fields = [
  "endow_designation",
  "hq_country",
  "active_in_countries",
  "street_address",
] as const satisfies (keyof FV)[];

const general_schema = v.pick(schema, general_fields);
const organization_schema = v.pick(schema, organization_fields);
const social_media_schema = v.pick(schema, ["social_media_urls"]);

type General = v.InferInput<typeof general_schema>;
type Organization = v.InferInput<typeof organization_schema>;
type SocialMedia = v.InferInput<typeof social_media_schema>;

/** a dirty-fields entry is `true`, or an object/array of entries for a nested
 * field — which RHF can leave behind empty once every leaf is reverted */
const is_marked = (x: unknown): boolean =>
  x === true ||
  (typeof x === "object" && x !== null && Object.values(x).some(is_marked));

/** validation runs through `trigger`, which never marks the form submitted,
 * so `reValidateMode` never engages — an errored field re-validates here */
function use_revalidate_errored<T extends FieldValues>({
  watch,
  getFieldState,
  trigger,
}: UseFormReturn<T>) {
  useEffect(() => {
    const sub = watch((_, { name }) => {
      if (name && getFieldState(name).error) trigger(name);
    });
    return () => sub.unsubscribe();
  }, [watch, getFieldState, trigger]);
}

/** validates with focus-on-error before the group's save holds its controls —
 * a disabled input can't take focus. marks saved the values it sent */
function use_group<T extends FieldValues>(
  form: UseFormReturn<T>,
  set_prompt: SetPrompt
) {
  const { save, busy } = use_save(set_prompt);
  const submit = async (
    names: Parameters<UseFormReturn<T>["trigger"]>[0],
    build: (values: T) => Update | undefined | Promise<Update | undefined>
  ) => {
    if (!(await form.trigger(names, { shouldFocus: true }))) return;
    const values = form.getValues();
    await save(
      () => build(values),
      () => form.reset(values)
    );
  };
  return { submit, busy };
}

export function use_general(init: FV, npo_id: number, set_prompt: SetPrompt) {
  const form = useForm<General>({
    // seeded once, never from `values`: another group's save revalidates the
    // loader, and a re-seed would wipe unsaved edits here
    defaultValues: {
      name: init.name,
      tagline: init.tagline,
      registration_number: init.registration_number,
      image: init.image,
      logo: init.logo,
      card_img: init.card_img,
      overview: init.overview,
      url: init.url,
      slug: init.slug,
    },
    resolver: valibotResolver(general_schema),
  });
  use_revalidate_errored(form);
  const { control } = form;
  const { errors, dirtyFields, isDirty } = form.formState;
  const { submit, busy } = use_group(form, set_prompt);
  const dirty = (name: keyof General) => is_marked(dirtyFields[name]);

  const { field: banner } = useController({ control, name: "image" });
  const { field: logo } = useController({ control, name: "logo" });
  const { field: card_img } = useController({ control, name: "card_img" });
  const { field: overview } = useController({ control, name: "overview" });
  const slug = useWatch({ control, name: "slug" });

  const save = () =>
    submit([...general_fields], async (values) => {
      const fv = v.parse(general_schema, values);
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
    });

  return {
    ...form,
    errors,
    is_dirty: isDirty,
    busy,
    save,
    banner,
    logo,
    card_img,
    overview,
    slug,
  };
}

export function use_organization(init: FV, set_prompt: SetPrompt) {
  const form = useForm<Organization>({
    defaultValues: {
      endow_designation: init.endow_designation,
      hq_country: init.hq_country,
      active_in_countries: init.active_in_countries,
      street_address: init.street_address,
    },
    resolver: valibotResolver(organization_schema),
  });
  use_revalidate_errored(form);
  const { control } = form;
  const { errors, dirtyFields, isDirty } = form.formState;
  const { submit, busy } = use_group(form, set_prompt);
  const dirty = (name: keyof Organization) => is_marked(dirtyFields[name]);

  const { field: designation } = useController({
    control,
    name: "endow_designation",
  });
  const { field: hq_country } = useController({ control, name: "hq_country" });
  const { field: active_in_countries } = useController({
    control,
    name: "active_in_countries",
  });

  const save = () =>
    submit([...organization_fields], (values) => {
      const fv = v.parse(organization_schema, values);
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
    });

  return {
    ...form,
    errors,
    is_dirty: isDirty,
    busy,
    save,
    designation,
    hq_country,
    active_in_countries,
  };
}

export function use_social_media(init: FV, set_prompt: SetPrompt) {
  const form = useForm<SocialMedia>({
    defaultValues: { social_media_urls: init.social_media_urls },
    resolver: valibotResolver(social_media_schema),
  });
  use_revalidate_errored(form);
  const { errors, isDirty } = form.formState;
  const { submit, busy } = use_group(form, set_prompt);

  const save = () =>
    submit("social_media_urls", (values) => {
      const fv = v.parse(social_media_schema, values);
      return { social_media_urls: fv.social_media_urls };
    });

  return { ...form, errors, is_dirty: isDirty, busy, save };
}

/** saves on flip. a refused flip keeps showing what the user chose — nothing
 * re-seeds it */
export function use_publish(init: FV, set_prompt: SetPrompt) {
  const [published, set_published] = useState(init.published);
  const { save, busy } = use_save(set_prompt);
  const publish = (next: boolean) =>
    save(() => {
      set_published(next);
      return { published: next };
    });
  return { published, publish, busy };
}
