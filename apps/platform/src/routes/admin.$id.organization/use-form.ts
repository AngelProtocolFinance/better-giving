import type { IPrompt } from "@better-giving/ui";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { useEffect } from "react";
import { useController, useForm, useWatch } from "react-hook-form";
import * as v from "valibot";
import { type Update, use_save } from "../admin.$id.edit-profile/use-save";
import { type FV, fields, schema } from "./schema";

type SetPrompt = (p: IPrompt) => void;

const is_marked = (x: unknown): boolean =>
  x === true ||
  (typeof x === "object" && x !== null && Object.values(x).some(is_marked));

export function use_organization_form(
  init: FV,
  npo_id: number,
  set_prompt: SetPrompt
) {
  const locked = init.slug !== "";
  const form = useForm<FV>({
    defaultValues: init,
    resolver: valibotResolver(schema),
  });
  const { control, formState, watch, getFieldState, trigger } = form;

  useEffect(() => {
    const sub = watch((_, { name }) => {
      if (name && getFieldState(name).error) trigger(name);
    });
    return () => sub.unsubscribe();
  }, [watch, getFieldState, trigger]);

  const { save, busy } = use_save(set_prompt, "applying organization changes");
  const dirty = (name: keyof FV) => is_marked(formState.dirtyFields[name]);
  const { field: logo } = useController({ control, name: "logo" });
  const { field: designation } = useController({
    control,
    name: "endow_designation",
  });
  const { field: hq_country } = useController({ control, name: "hq_country" });
  const slug = useWatch({ control, name: "slug" });
  const name = useWatch({ control, name: "name" });

  const submit = async () => {
    if (!(await form.trigger([...fields], { shouldFocus: true }))) return;
    const values = structuredClone(form.getValues());
    await save(
      async () => {
        const fv = v.parse(schema, values);
        const update: Update = {};
        if (!locked && dirty("slug") && fv.slug !== "") {
          const found = await fetch(`/api/npos/${fv.slug}?fields=id`).then(
            (r) => (r.status === 404 ? undefined : r.json())
          );
          if (found?.id && found.id !== npo_id) {
            set_prompt({
              type: "error",
              children: `Slug "${fv.slug}" is already taken`,
            });
            return;
          }
          update.slug = fv.slug;
        }
        if (dirty("name")) update.name = fv.name;
        if (dirty("registration_number")) {
          update.registration_number = fv.registration_number;
        }
        if (dirty("logo")) update.logo = fv.logo;
        if (dirty("endow_designation")) {
          update.endow_designation = fv.endow_designation;
        }
        if (dirty("hq_country")) update.hq_country = fv.hq_country;
        if (Object.keys(update).length === 0) return;
        return update;
      },
      () => {
        const current = form.getValues();
        form.reset(values, { keepValues: true });
        for (const key of Object.keys(current) as (keyof FV)[]) {
          form.setValue(key, current[key], { shouldDirty: true });
        }
      }
    );
  };

  return {
    ...form,
    errors: formState.errors,
    is_dirty: formState.isDirty,
    busy,
    save: submit,
    locked,
    logo,
    designation,
    hq_country,
    slug,
    name,
  };
}
