import { Field, Select } from "@better-giving/ui";
import { useController } from "react-hook-form";
import { useFetcher, useNavigation, useSearchParams } from "react-router";
import { useRemixForm } from "remix-hook-form";
import type { ILoaderData } from "../api";
import type { FV } from "../schema";
import { NpoSelector } from "./npo-selector";

export const form_style = "w-full p-3";

interface Props extends ILoaderData {
  classes?: string;
}

export function Form({ classes = "", ...p }: Props) {
  const [, set_search] = useSearchParams();
  const f = useFetcher<ILoaderData>();
  const nav = useNavigation();

  const init: FV = { tag: "", program: "" };
  const {
    handleSubmit,
    register,
    control,
    formState: { errors },
  } = useRemixForm<FV>({
    defaultValues: init,
    fetcher: f,
  });

  const { field: prog } = useController<FV, "program">({
    name: "program",
    control,
  });

  return (
    <f.Form
      method="PUT"
      onSubmit={handleSubmit}
      className={`${classes} ${form_style} grid gap-5 p-4`}
      autoComplete="off"
      autoSave="off"
    >
      {p.npos && (
        <NpoSelector
          label="Select nonprofit"
          required
          value={p.npos.value}
          on_change={(opt) => {
            set_search((s) => {
              s.set("npo_id", opt.id.toString());
              return s;
            });
          }}
        />
      )}

      {p.programs.length > 0 && (
        <Select
          label="Select program"
          required={false}
          // "" is the empty form value, not an option — keep the placeholder
          value={prog.value || undefined}
          placeholder="Select a program"
          onChange={prog.onChange}
          options={p.programs.map((x) => x.id)}
          error={errors.program?.message}
          ref={prog.ref}
          classes={{
            option: "text-sm",
            container: "mb-4",
            label: "",
          }}
          option_disp={(x) => p.programs.find((pr) => pr.id === x)?.title || ""}
        />
      )}

      <Field
        sub="A meaningful label to help you identify this form."
        {...register("tag")}
        label="Tag"
        placeholder="e.g. in mywebsite.com"
        required
        error={errors.tag?.message}
        classes={{}}
      />

      <button
        className="col-span-full btn btn-primary"
        disabled={f.state !== "idle" || nav.state !== "idle"}
        type="submit"
      >
        Submit
      </button>
    </f.Form>
  );
}
