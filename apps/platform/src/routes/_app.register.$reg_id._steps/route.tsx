import { Outlet, useRouteLoaderData } from "react-router";
import { IdentitySummary } from "#/pages/registration/identity-summary";
import { ProgressIndicator } from "#/pages/registration/progress-indicator";
import Reference from "#/pages/registration/reference";
import type { Reg$IdData } from "#/pages/registration/types";
import { Progress } from "@/reg/progress";

export default function Layout() {
  const { reg, user } = useRouteLoaderData(
    "routes/_app.register.$reg_id"
  ) as Reg$IdData;

  return (
    <div className="w-full md:w-[90%] max-w-250 pt-8 grid md:grid-cols-[auto_1fr] md:border rounded md:rounded bg-card">
      <ProgressIndicator
        step={new Progress(reg).step}
        o_type={reg.o_type}
        classes="md:min-w-48 lg:min-w-62"
      />

      <div className="grid z-10 w-full px-6 py-8 md:p-0 md:pr-8 md:shadow-none shadow-[0px_4px_6px,0px_-4px_6px] shadow-border/80 dark:shadow-background">
        <Outlet context={user} />
      </div>
      <IdentitySummary reg={reg} classes="col-span-full md:mt-8" />
      <Reference id={reg.id} classes="col-span-full" />
    </div>
  );
}
