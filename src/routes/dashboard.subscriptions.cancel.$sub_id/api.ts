import { data } from "react-router";
import { user_ctx } from "#/.server/auth";
import { redirectWithSuccess } from "#/.server/toast";
import * as sub_deactivated from "@/queue/msgs/sub-deactivated";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { sub_get, sub_update } from "$/pg/queries/subscription";
import type { Route } from "./+types/route";

export const loader = async ({ context, params }: Route.LoaderArgs) => {
  const user = context.get(user_ctx);
  const sub = await sub_get(params.sub_id);
  if (!sub || sub.from_id !== user.email) {
    throw data("Not found", { status: 404 });
  }
  return { recipient_name: sub.to_name };
};

export const action = async ({
  context,
  request,
  params,
}: Route.ActionArgs) => {
  const user = context.get(user_ctx);
  const existing = await sub_get(params.sub_id);
  if (!existing || existing.from_id !== user.email) {
    throw data("Not found", { status: 404 });
  }
  const { reason } = await request.json();
  const { row, prev_status } = await sub_update(db, params.sub_id, {
    status: "inactive",
    status_cancel_reason: reason,
    updated_at: new Date().toISOString(),
  });
  if (row && prev_status === "active") {
    await enqueue(sub_deactivated.to_msg(row));
  }
  return redirectWithSuccess("..", "Subscription cancelled");
};
