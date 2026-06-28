import type { ActionFunction } from "react-router";
import { user_ctx } from "#/.server/auth";
import { dataWithSuccess } from "#/.server/toast";
import type { IUserDb } from "@/users/schema";
import { user_get, user_update } from "$/pg/queries/user";
import type { Route } from "./+types/route";

export interface LoaderData {
  db_user: IUserDb;
}

export const loader = async ({ context }: Route.LoaderArgs) => {
  const user = context.get(user_ctx);
  const db_user = await user_get(user.email);
  if (!db_user) throw new Response("user not found", { status: 404 });
  return { db_user } satisfies LoaderData;
};

export const action: ActionFunction = async ({ request, context }) => {
  const user = context.get(user_ctx);
  const body = await request.json();

  await user_update(user.email, body);

  return dataWithSuccess(null, "User profile updated", {
    headers: { "x-remix-revalidate": "1" },
  });
};
