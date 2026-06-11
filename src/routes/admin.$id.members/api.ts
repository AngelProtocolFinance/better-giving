import { admin_ctx, user_ctx } from "#/.server/auth";
import { dataWithSuccess } from "#/.server/toast";
import type { AuthUser } from "#/types/auth";
import type { INpoAdmin } from "@/users";
import { npo_admins, npo_invite_del, userxnpo_del } from "$/pg/queries/user";
import type { Route } from "./+types/route";

export interface LoaderData {
  user: AuthUser;
  admins: INpoAdmin[];
}

export const members = async (x: Route.LoaderArgs) => {
  const id = x.context.get(admin_ctx);
  const user = x.context.get(user_ctx);
  const admins = await npo_admins(id);
  return { admins, user } satisfies LoaderData;
};

export const delete_action = async (x: Route.ActionArgs) => {
  const id = x.context.get(admin_ctx);
  const body = (await x.request.json()) as {
    to_remove?: string;
    pending_email?: string;
  };
  if (body.pending_email) {
    await npo_invite_del(id, body.pending_email);
  } else if (body.to_remove) {
    await userxnpo_del(id, body.to_remove);
  } else {
    throw new Response("Bad request", { status: 400 });
  }

  return dataWithSuccess(null, "Member removed");
};
