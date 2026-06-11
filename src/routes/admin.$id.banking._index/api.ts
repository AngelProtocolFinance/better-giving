import { admin_ctx } from "#/.server/auth";
import type { IBapp } from "@/banking";
import { npo_bapps } from "$/pg/queries/banking";
import type { Route } from "./+types/route";

export interface LoaderData {
  methods: IBapp[];
}

export const loader = async (x: Route.LoaderArgs) => {
  const id = x.context.get(admin_ctx);

  const page = await npo_bapps(id);
  return { methods: page.items } satisfies LoaderData;
};
