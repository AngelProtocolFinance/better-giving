import { type ActionFunction, redirect } from "react-router";
import { user_ctx } from "#/.server/auth";
import { anvil, stage } from "$/env";
import { user_update } from "$/pg/queries/user";

export interface LoaderData {
  w9_url: string;
  w8ben_url: string;
}

const anvil_form_url = (forge_slug: string) =>
  `https://app.useanvil.com/weld/${anvil.org_slug}/${forge_slug}${stage === "staging" ? "?test=true" : ""}`;
export const loader = async () => {
  const wform: LoaderData = {
    w8ben_url: anvil_form_url("fw8ben"),
    w9_url: anvil_form_url("irs-w9"),
  };

  return wform;
};

export const action: ActionFunction = async ({ request, context }) => {
  const user = context.get(user_ctx);

  const amnt = await request.text();
  await user_update(user.email, { pay_min: +amnt });

  return redirect("..");
};
