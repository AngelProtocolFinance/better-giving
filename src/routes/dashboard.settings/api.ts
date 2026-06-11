import type { ActionFunction } from "react-router";
import { safeParse } from "valibot";
import { user_ctx } from "#/.server/auth";
import { dataWithSuccess } from "#/.server/toast";
import { user_npos } from "#/.server/user";
import type { IUserNpo2 } from "#/types/user";
import { resp } from "@/helpers/https";
import { db } from "$/pg/db";
import { userxnpo_update } from "$/pg/queries/user";
import type { Route } from "./+types/route";
import { alert_prefs } from "./schema";

export interface SettingsData {
  email: string;
  user_npos: IUserNpo2[];
}

export const loader = async ({ context }: Route.LoaderArgs) => {
  const user = context.get(user_ctx);

  return {
    email: user.email,
    user_npos: await user_npos(user.id),
  } satisfies SettingsData;
};

export const action: ActionFunction = async ({ request, context }) => {
  const user = context.get(user_ctx);

  const p = safeParse(alert_prefs, await request.json());
  if (p.issues) return resp.status(400, p.issues[0].message);
  const prefs = p.output;

  await db.transaction(async (tx) => {
    for (const { npo, ...p } of prefs) {
      await userxnpo_update(tx, npo, user.id, { alert_pref: p });
    }
  });

  return dataWithSuccess(null, "Settings updated");
};
