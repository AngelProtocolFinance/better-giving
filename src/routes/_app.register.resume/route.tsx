import { valibotResolver } from "@hookform/resolvers/valibot";
import { NavLink, redirect, useFetcher } from "react-router";
import { getValidatedFormData, useRemixForm } from "remix-hook-form";
import { get_session, to_auth } from "#/.server/auth";
import { reg_cookie } from "#/.server/cookie";
import { Field } from "#/components/form";
import { Separator } from "#/components/separator";
import { Progress } from "@/reg/progress";
import { reg_get } from "$/pg/queries/registration";
import type { Route } from "./+types/route";
import { type FV, schema } from "./types";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const { user } = await get_session(request);
  if (!user) return to_auth(request);

  const rc = await reg_cookie
    .parse(request.headers.get("cookie"))
    .then((x) => x || {});
  return rc.reference || null;
};
export const action = async ({ request }: Route.ActionArgs) => {
  const { user } = await get_session(request);
  if (!user) return to_auth(request);

  const fv = await getValidatedFormData<FV>(request, valibotResolver(schema));
  if (fv.errors) return fv;

  const reg = await reg_get(fv.data.reference);
  if (!reg) return { status: 404 };

  /** set existing reference user inputs */
  const rc = await reg_cookie
    .parse(request.headers.get("cookie"))
    .then((x) => x || {});
  rc.reference = reg.id;

  return redirect(`../${reg.id}/${new Progress(reg).step}`, {
    headers: {
      "set-cookie": await reg_cookie.serialize(rc),
    },
  });
};

export { ErrorBoundary } from "#/components/error";

export default function Page({ loaderData: prev }: Route.ComponentProps) {
  const fetcher = useFetcher();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRemixForm<FV>({
    fetcher,
    resolver: valibotResolver(schema),
    defaultValues: { reference: prev || "" },
  });

  return (
    <fetcher.Form
      method="POST"
      onSubmit={handleSubmit}
      className="grid px-5 w-full max-w-2xl"
    >
      <h3 className="text-3xl text-center">Resume registration</h3>
      <p className="text-center mt-2 text-muted-fg text-lg">
        Enter your registration reference to resume where you left off
      </p>

      <Field
        {...register("reference")}
        label="Registration reference"
        placeholder="e.g. 00000000-0000-0000-0000-000000000000"
        classes={{ container: "mt-8 mx-0 sm:mx-24" }}
        error={errors.reference?.message}
      />

      <button
        type="submit"
        className="mt-8 mx-0 sm:mx-24 btn btn-primary text-sm"
        disabled={fetcher.state !== "idle"}
      >
        Resume
      </button>
      <Separator classes="my-11 mx-0 sm:mx-24 before:mr-2 after:ml-2">
        OR
      </Separator>
      <NavLink
        className="mx-0 sm:mx-24 btn-secondary btn text-sm"
        to=".."
        aria-disabled={fetcher.state !== "idle"}
      >
        Register new account
      </NavLink>
    </fetcher.Form>
  );
}
