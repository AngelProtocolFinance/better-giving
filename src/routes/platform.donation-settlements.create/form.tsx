import { valibotResolver } from "@hookform/resolvers/valibot";
import { useEffect } from "react";
import { useController, useForm } from "react-hook-form";
import { useFetcher } from "react-router";
import * as v from "valibot";
import { Field } from "#/components/form/field";
import { Label } from "#/components/form/label";
import { NpoSelector } from "#/pages/shared/form-create/form/npo-selector";
import type { IFormValues, INpoOpt } from "./types";

const schema = v.object({
  from: v.picklist(["cheque", "daf"]),
  npo: v.custom<INpoOpt>(
    (v): v is INpoOpt =>
      v != null && typeof v === "object" && "id" in v && "name" in v,
    "Select a nonprofit"
  ),
  donor_name: v.optional(v.string(), ""),
  donor_email: v.optional(v.string(), "settlement@better.giving"),
  net: v.pipe(v.string(), v.nonEmpty("Enter a valid amount")),
  reference: v.pipe(v.string(), v.nonEmpty("Enter a reference ID")),
});

interface IFormProps {
  defaults: IFormValues;
  loading: boolean;
  on_preview: (values: IFormValues) => void;
  on_close: () => void;
}

export function SettleForm({
  defaults,
  loading,
  on_preview,
  on_close,
}: IFormProps) {
  const npo_fetcher = useFetcher({ key: "npo-search" });

  // load initial NPO list
  const loaded = npo_fetcher.data != null || npo_fetcher.state !== "idle";
  const { load } = npo_fetcher;
  useEffect(() => {
    if (!loaded) load("/api/npos");
  }, [loaded, load]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<IFormValues>({
    resolver: valibotResolver(schema),
    defaultValues: defaults,
  });

  const { field: npo_field } = useController({ name: "npo", control });

  const q = npo_fetcher.formData?.get("query")?.toString() ?? "";
  const npo_opts: "loading" | string | INpoOpt[] =
    npo_fetcher.state === "loading"
      ? "loading"
      : q && !npo_fetcher.data?.items?.length
        ? q
        : (npo_fetcher.data?.items ?? []);

  return (
    <form onSubmit={handleSubmit(on_preview)}>
      <div className="p-6 sm:p-8 grid gap-4">
        <h3 className="text-lg font-bold">New settlement</h3>

        <div>
          <Label htmlFor="__from" required className="mb-1">
            From
          </Label>
          <select
            id="__from"
            {...register("from")}
            className="w-full rounded border border-border bg-card px-3 py-2 text-sm font-medium text-fg focus:outline-primary"
          >
            <option value="cheque">Cheque</option>
            <option value="daf">DAF</option>
          </select>
        </div>

        <div>
          <Label required className="mb-1">
            Nonprofit
          </Label>
          <NpoSelector
            q={q}
            on_q_change={(q) => {
              npo_fetcher.submit(q ? { query: q } : {}, {
                method: "GET",
                action: "/api/npos",
              });
            }}
            value={npo_field.value}
            on_change={npo_field.onChange}
            opts={npo_opts}
          />
          {errors.npo && (
            <p className="text-xs text-destructive mt-1">
              {errors.npo.message}
            </p>
          )}
        </div>

        <Field
          {...register("donor_name")}
          label="Donor name"
          placeholder="Anonymous"
          classes={{ input: "w-full" }}
        />

        <Field
          {...register("donor_email")}
          label="Donor email"
          type="email"
          placeholder="settlement@better.giving"
          classes={{ input: "w-full" }}
        />

        <Field
          {...register("net")}
          label="Net amount (USD)"
          type="number"
          required
          min={0.01}
          step={0.01}
          placeholder="0.00"
          classes={{ input: "w-full" }}
          error={errors.net?.message}
        />

        <Field
          {...register("reference")}
          label="Reference / Grant ID"
          required
          placeholder="e.g. Fidelity deposit #123"
          classes={{ input: "w-full" }}
          error={errors.reference?.message}
        />
      </div>

      <div className="p-3 sm:px-8 sm:py-4 flex items-center justify-end gap-4 w-full bg-muted border-t">
        <button
          type="button"
          onClick={on_close}
          className="btn-secondary btn text-sm px-8 py-2"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary px-8 py-2 text-sm"
        >
          {loading ? "Loading..." : "Preview"}
        </button>
      </div>
    </form>
  );
}
