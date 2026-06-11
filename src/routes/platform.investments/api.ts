import type { ILog } from "@/nav";
import type { IPageKeyed } from "@/types/api";
import { nav_log_list, nav_ltd, nav_week_series } from "$/pg/queries/nav";
import type { Route } from "./+types/route";

export interface LoaderData {
  ltd: ILog;
  logs: ILog[];
  recent_logs: IPageKeyed<ILog>;
}

export const loader = async (_: Route.LoaderArgs) => {
  const [ltd, logs, recent_logs] = await Promise.all([
    nav_ltd(),
    nav_week_series(),
    nav_log_list({
      limit: 3,
    }),
  ]);

  return {
    ltd,
    logs: logs.items,
    recent_logs,
  } satisfies LoaderData;
};
