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
      firstName: props.db_user.first_name ?? "",
      lastName: props.db_user.last_name ?? "",
      avatar: props.db_user.avatar_url ?? "",
    },
  });

  const { field: avatar } = useController<FV, "avatar">({
    control,
    name: "avatar",
  });

  return {
    avatar,
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
