import { app_name } from "#/constants/env";
import { metas } from "#/helpers/seo";
import type { Route } from "./+types/route";
import { CheckEmail } from "./check-email";
import { Expired } from "./expired";
import { InitForm } from "./init-form";
import { MigratedInfo } from "./migrated-info";
import { SetPasswordForm } from "./set-password-form";
import { Success } from "./success";

export { ErrorBoundary } from "#/components/error";
export { action, loader } from "./api";

export const meta: Route.MetaFunction = () =>
  metas({ title: `Reset Password - ${app_name}` });

export default function Page({ loaderData }: Route.ComponentProps) {
  const { redirect, step } = loaderData;

  const content = (() => {
    if (step.type === "init") {
      return <InitForm to={redirect} />;
    }

    if (step.type === "migrated") {
      return <MigratedInfo email={step.email} to={redirect} />;
    }

    if (step.type === "expired") {
      return <Expired email={step.email} />;
    }

    if (step.type === "set-password") {
      if (!step.token) return <CheckEmail email={step.email} to={redirect} />;
      return <SetPasswordForm email={step.email} token={step.token} />;
    }

    return <Success to={redirect} />;
  })();

  return (
    <div className="grid place-items-center px-4 py-14 text-muted-fg">
      {content}
    </div>
  );
}
