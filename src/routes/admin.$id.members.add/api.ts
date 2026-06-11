import { valibotResolver } from "@hookform/resolvers/valibot";
import { getValidatedFormData } from "remix-hook-form";
import { admin_ctx, user_ctx } from "#/.server/auth";
import { redirectWithSuccess } from "#/.server/toast";
import * as invite_email from "@/queue/msgs/invite-email";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { npo_get } from "$/pg/queries/npo";
import { npo_admin_tx } from "$/pg/queries/user";
import type { Route } from "./+types/route";
import { type ISchema, schema } from "./schema";

export const add_action = async (x: Route.ActionArgs) => {
  const id = x.context.get(admin_ctx);
  const user = x.context.get(user_ctx);

  const fv = await getValidatedFormData<ISchema>(
    x.request,
    valibotResolver(schema([]))
  );
  if (fv.errors) return fv;

  const npo = await npo_get(id);
  if (!npo) return { status: 404 };

  const invite = {
    npo_name: npo.name,
    invitee: fv.data.email,
    invitee_first_name: fv.data.first_name,
    invitor: user.email,
  };
  await npo_admin_tx(db, id, invite, user.id);
  await enqueue(invite_email.to_msg(invite));

  return redirectWithSuccess("..", "Member invited");
};
