import { valibotResolver } from "@hookform/resolvers/valibot";
import { useController, useForm } from "react-hook-form";
import type { ImgSpec } from "#/components/img-editor";
import type { LoaderData } from "./api";
import { type FV, schema } from "./types";

export const avatar_spec: ImgSpec = {
  type: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
  aspect: [1, 1],
  max_size: 4e6,
  rounded: true,
};

export function use_rhf(props: LoaderData) {
  const {
    register,
    control,
    reset,
    handleSubmit,
    resetField,
    trigger,
    formState: { isDirty, errors, dirtyFields },
  } = useForm({
    resolver: valibotResolver(schema),
    values: {
      first_name: props.db_user.first_name ?? "",
      last_name: props.db_user.last_name ?? "",
      avatar_url: props.db_user.avatar_url ?? "",
    },
  });

  const { field: avatar_url } = useController<FV, "avatar_url">({
    control,
    name: "avatar_url",
  });

  return {
    avatar_url,
    register,
    handleSubmit,
    resetField,
    reset,
    trigger,
    errors,
    isDirty,
    df: dirtyFields,
  };
}
