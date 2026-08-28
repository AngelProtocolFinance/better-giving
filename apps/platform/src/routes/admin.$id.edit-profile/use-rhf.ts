import { valibotResolver } from "@hookform/resolvers/valibot";
import { useController, useForm } from "react-hook-form";
import { type FV, schema } from "./schema";
export function use_rhf(init: FV) {
  const {
    handleSubmit,
    register,
    reset,
    resetField,
    control,
    trigger,
    watch,
    formState: { isSubmitting, errors, isDirty, dirtyFields },
  } = useForm<FV>({ values: init, resolver: valibotResolver(schema) });

  const slug = watch("slug");
  // registration order is load-bearing: RHF's focus-on-error walks fields in
  // the order they registered, not in DOM order, so these three must match the
  // order form.tsx renders them — banner, logo, card image.
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
    reset,
    resetField,
    isSubmitting,
    trigger,
    isDirty,
    dirtyFields,
    handleSubmit,
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
