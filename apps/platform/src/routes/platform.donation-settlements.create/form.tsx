import { Actions, Field, Label } from "@better-giving/ui";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { useEffect } from "react";
import type { Resolver } from "react-hook-form";
import { useController, useForm, useWatch } from "react-hook-form";
import { useFetcher } from "react-router";
import * as v from "valibot";
import { NpoSelector } from "#/pages/shared/form-create/form/npo-selector";
import type { IFormValues, INpoOpt } from "./types";

/** a match that names a gift takes its recipient from that gift, fund or npo alike */
const gift_decides = (o: { from: string; for_donation_id?: string }) =>
  o.from === "match" && !!o.for_donation_id?.trim();

const npo_opt = v.custom<INpoOpt>(
  (v): v is INpoOpt =>
    v != null && typeof v === "object" && "id" in v && "name" in v,
  "Select a nonprofit"
);

const fields = {
  from: v.picklist(["cheque", "daf", "match"]),
  donor_name: v.optional(v.string(), ""),
  donor_email: v.optional(v.string(), "settlement@better.giving"),
  net: v.pipe(v.string(), v.nonEmpty("Enter a valid amount")),
  reference: v.pipe(v.string(), v.nonEmpty("Enter a reference ID")),
  for_donation_id: v.optional(v.string(), ""),
};

const schema = v.object({ ...fields, npo: npo_opt });
const schema_gift_decides = v.object({ ...fields, npo: v.optional(npo_opt) });

/**
 * the nonprofit stops being required once a matched gift names the recipient.
 *
 * picked here rather than expressed as a `v.forward` check on one schema: the
 * resolver aborts a piped check as soon as any other field has an issue, so an
 * empty form would report the amount and the reference and stay silent about
 * the nonprofit.
 */
const resolver: Resolver<IFormValues> = (values, ctx, opts) =>
  valibotResolver(gift_decides(values) ? schema_gift_decides : schema)(
    values,
    ctx,
    opts
  );

interface IFormProps {
  defaults: IFormValues;
  loading: boolean;
  /** why the last preview came back empty — a donation id or nonprofit that led nowhere */
  error: string | null;
  on_preview: (values: IFormValues) => void;
  on_close: () => void;
}

export function SettleForm({
  defaults,
  loading,
  error,
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
    resolver,
    defaultValues: defaults,
  });

  const { field: npo_field } = useController({ name: "npo", control });
  const from = useWatch({ control, name: "from" });
  const for_donation_id = useWatch({ control, name: "for_donation_id" });
  const from_gift = gift_decides({ from, for_donation_id });

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
            <option value="match">Employer match</option>
          </select>
        </div>

        <div>
          <NpoSelector
            label="Nonprofit"
            required={!from_gift}
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
          {/* the field goes optional without moving, so say why rather than
              leave the admin wondering which of the two is now in charge */}
          {from_gift && (
            <p className="text-muted-fg text-sm mt-1">
              Optional — the donation below decides where this goes. A gift to a
              fund is settled across the fund&apos;s nonprofits.
            </p>
          )}
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

        {/* only an employer's payment attaches to anything, so the field is
            hidden for the other two rather than left to be filled in and
            silently ignored */}
        {from === "match" && (
          <Field
            {...register("for_donation_id")}
            label="For donation ID"
            sub={
              <p className="text-muted-fg text-sm mb-2">
                The id the employer was asked to quote as{" "}
                <span className="font-medium">Donation &#123;id&#125;</span> on
                their payment — it&apos;s printed on the donor&apos;s donation
                page and in their filing-pack email. Leave empty if the payment
                names no donation.
              </p>
            }
            placeholder="e.g. 7c3f9a2e-..."
            classes={{ input: "w-full" }}
            error={errors.for_donation_id?.message}
          />
        )}

        {/* the loader's reason, not a field's — a preview that resolved to no
            records leaves the admin here, and has to say what it found */}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <Actions band>
        <button type="button" onClick={on_close} className="btn-secondary btn">
          Cancel
        </button>
        <button type="submit" disabled={loading} className="btn btn-primary">
          {loading ? "Loading..." : "Preview"}
        </button>
      </Actions>
    </form>
  );
}
