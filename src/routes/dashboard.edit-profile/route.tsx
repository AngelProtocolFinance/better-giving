import { useEffect } from "react";
import { useFetcher } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { CurrencySelector } from "#/components/currency-selector";
import { Field, Form, Label } from "#/components/form";
import { ImgEditor } from "#/components/img-editor";
import { use_user } from "#/hooks/use-user";
import type { Route } from "./+types/route";
import { avatar_spec, use_rhf } from "./use-rhf";

export { action, loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export { ErrorBoundary } from "#/components/error";

export default CacheRoute(Page);
function Page({ loaderData: data }: Route.ComponentProps) {
  const { revalidate } = use_user();
  const fetcher = useFetcher();
  useEffect(() => {
    if (fetcher.data !== undefined) revalidate();
  }, [fetcher.data, revalidate]);
  const rhf = use_rhf(data);

  return (
    <Form
      disabled={fetcher.state === "submitting"}
      onReset={(e) => {
        e.preventDefault();
        rhf.reset();
      }}
      onSubmit={rhf.handleSubmit(async (fv) => {
        const { df } = rhf;
        const update: Record<string, string> = {};

        if (df.firstName) update.first_name = fv.firstName;
        if (df.lastName) update.last_name = fv.lastName;
        if (df.prefCurrency) update.pref_currency = fv.prefCurrency.code;
        if (df.avatar) update.avatar_url = fv.avatar;

        fetcher.submit(update, {
          encType: "application/json",
          action: ".",
          method: "PATCH",
        });
      })}
      className="w-full max-w-4xl content-start px-6 py-4 md:px-10 md:py-8"
    >
      <h2 className="text-3xl mb-6">User Profile</h2>

      <Label className="mb-2">Avatar</Label>
      <ImgEditor
        spec={avatar_spec}
        value={rhf.avatar.value}
        on_change={(v) => {
          rhf.avatar.onChange(v);
          rhf.trigger("avatar");
        }}
        on_undo={(e) => {
          e.stopPropagation();
          rhf.resetField("avatar");
        }}
        classes={{
          container: "mb-4",
          dropzone: "w-60 aspect-1/1 rounded-full",
        }}
        error={rhf.errors.avatar?.message}
      />

      <CurrencySelector
        currencies={data.all}
        label="Default currency"
        onChange={rhf.prefCurrency.onChange}
        value={rhf.prefCurrency.value}
        classes={{ container: "mt-16" }}
        required
      />

      <Field
        {...rhf.register("firstName")}
        label="First name"
        placeholder="First name"
        classes={{ container: "mt-16" }}
        required
        error={rhf.errors.firstName?.message}
      />

      <Field
        {...rhf.register("lastName")}
        label="Last name"
        placeholder="Last name"
        required
        classes={{ container: "mt-4" }}
        error={rhf.errors.lastName?.message}
      />

      <div className="flex gap-3 mt-8">
        <button
          type="reset"
          className="px-6 btn-secondary btn text-sm"
          disabled={!rhf.isDirty}
        >
          Reset changes
        </button>
        <button
          type="submit"
          className="px-6 btn btn-primary text-sm"
          disabled={!rhf.isDirty || rhf.avatar.value === "loading"}
        >
          Submit changes
        </button>
      </div>
    </Form>
  );
}
