import { type ActionFunction, redirect } from "react-router";
import { user_ctx } from "#/.server/auth";
import { user_get, user_update } from "$/pg/queries/user";
import type { Route } from "./+types/route";

export const loader = async ({ context }: Route.LoaderArgs) => {
  const user = context.get(user_ctx);
  const db_user = await user_get(user.email);
  return { pay_min: db_user?.pay_min?.toString() };
};

export const action: ActionFunction = async ({ request, context }) => {
  const user = context.get(user_ctx);

  const amnt = await request.text();
  await user_update(user.email, { pay_min: +amnt });

  return redirect("..", {
    headers: {
      "x-remix-revalidate": "1",
      "cache-control": "no-cache",
    },
  });
};
