import { href, Outlet, useRouteLoaderData } from "react-router";
import { ExtLink } from "#/components/ext-link";
import { ProgressIndicator } from "#/pages/registration/progress-indicator";
import Reference from "#/pages/registration/reference";
import type { Reg$IdData } from "#/pages/registration/types";
import { Progress } from "@/reg/progress";

export default function Layout() {
  const { reg, user } = useRouteLoaderData(
    "routes/_app.register.$reg_id"
  ) as Reg$IdData;

  return (
    <div className="w-full md:w-[90%] max-w-250 [&]:has-data-[claim='true']:pt-0 pt-8 grid md:grid-cols-[auto_1fr] md:border rounded md:rounded bg-card">
      {reg.claim && (
        <div
          data-claim
          className="bg-secondary col-span-full md:mb-8 rounded-t p-2 text-muted-fg text-sm"
        >
          Claiming{" "}
          <ExtLink
            className="font-bold hover:underline"
            href={href("/marketplace/:id", { id: reg.claim.id.toString() })}
          >
            {reg.claim.name}
          </ExtLink>
          , EIN: <span className="font-bold">{reg.claim.ein}</span>
        </div>
      )}
      <ProgressIndicator
        step={new Progress(reg).step}
        classes="md:min-w-48 lg:min-w-62"
      />

      <div className="grid z-10 w-full px-6 py-8 md:p-0 md:pr-8 md:shadow-none shadow-[0px_4px_6px,0px_-4px_6px] shadow-border/80 dark:shadow-background">
        <Outlet context={user} />
      </div>
      <Reference id={reg.id} classes="col-span-full md:mt-8" />
    </div>
  );
}
