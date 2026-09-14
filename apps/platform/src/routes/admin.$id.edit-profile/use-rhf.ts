import { valibotResolver } from "@hookform/resolvers/valibot";
import { useEffect } from "react";
import { useController, useForm } from "react-hook-form";
import { type FV, schema } from "./schema";
export function use_rhf(init: FV) {
  const {
    register,
    resetField,
    getValues,
    control,
    trigger,
    watch,
    getFieldState,
    formState: { errors, dirtyFields },
  } = useForm<FV>({
    values: init,
    // a group's save revalidates the loader, and the re-seed must not wipe
    // unsaved edits in the other groups
    resetOptions: { keepDirtyValues: true },
    resolver: valibotResolver(schema),
  });

  // validation runs on a group's save, which never marks the form submitted,
  // so `reValidateMode` never engages — an errored field re-validates here
  useEffect(() => {
    const sub = watch((_, { name }) => {
      if (name && getFieldState(name).error) trigger(name);
    });
    return () => sub.unsubscribe();
  }, [watch, getFieldState, trigger]);

  const slug = watch("slug");
  // focus-on-error follows the group's field list passed to `trigger`
  // (`groups` in use-edit-profile.ts), not the order these register in.
  const { field: banner } = useController({ control, name: "image" });
  const { field: logo } = useController({ control, name: "logo" });
  const { field: card_img } = useController({ control, name: "card_img" });
  const { field: overview } = useController({ control, name: "overview" });
  const { field: designation } = useController({
    control,
    name: "endow_designation",
  });
  const { field: hqCountry } = useController({
    control,
    name: "hq_country",
  });
  const { field: activityCountries } = useController({
    control,
    name: "active_in_countries",
  });
  const { field: published } = useController({
    control,
    name: "published",
  });

  return {
    //rhf
    register,
    errors,
    resetField,
    getValues,
    trigger,
    dirtyFields,
    //controllers
    card_img,
    logo,
    banner,
    overview,
    slug,
    designation,
    hqCountry,
    activityCountries,
    published,
  };
}
