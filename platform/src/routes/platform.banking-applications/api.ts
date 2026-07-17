import type { TStatus } from "@/banking";
import { search } from "@/helpers/https";
import { bapps_by_status } from "$/pg/queries/banking";
import type { Route } from "./+types/route";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const { status = "under-review", nextPageKey } = search(request.url);
  // "" = all reviewable statuses (excludes "default" which is user-initiated)
  const statuses: TStatus[] | undefined = status
    ? [status as TStatus]
    : ["under-review", "approved", "rejected"];
  const page = await bapps_by_status(statuses, {
    next: nextPageKey as string | undefined,
  });
  return page;
};
