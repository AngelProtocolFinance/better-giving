import { type ActionFunction, redirect } from "react-router";
import { user_ctx } from "#/.server/auth";
import { user_update } from "$/pg/queries/user";

export const action: ActionFunction = async ({ request, context }) => {
  const user = context.get(user_ctx);

  const recipient_id = await request.text();
  await user_update(user.email, { pay_id: recipient_id });

  return redirect("../referrals", {
    headers: {
      "x-remix-revalidate": "1",
      "cache-control": "no-cache",
    },
  });
};
