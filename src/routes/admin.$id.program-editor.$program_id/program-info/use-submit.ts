import type { FieldNamesMarkedBoolean, SubmitHandler } from "react-hook-form";
import { useFetcher } from "react-router";
import type { IProgramUpdate } from "@/npo";
import type { FV } from "./schema";

export default function useSubmit(
  df: Partial<Readonly<FieldNamesMarkedBoolean<FV>>>
) {
  const fetcher = useFetcher();

  const submit: SubmitHandler<FV> = async (fv) => {
    const update: IProgramUpdate = {};
    if (df.image) update.banner = fv.image;
    if (df.description) {
      update.description_rich = fv.description.value;
    }
    if (df.title) update.title = fv.title;
    if (df.target_raise) {
      update.target_raise = fv.target_raise ? +fv.target_raise : null;
    }

    fetcher.submit(update, {
      method: "POST",
      action: ".",
      encType: "application/json",
    });
  };

  return { submit, is_loading: fetcher.state !== "idle" };
}
