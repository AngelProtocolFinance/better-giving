import { type ActionFunction, href, redirect } from "react-router";
import { auth, to_auth } from "#/.server/auth";

export const action: ActionFunction = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return to_auth(request);

  const res = await auth.api.signOut({
    headers: request.headers,
    asResponse: true,
  });

  const headers = new Headers();
  const cookie = res.headers.get("set-cookie");
  if (cookie) headers.set("set-cookie", cookie);
  return redirect(href("/marketplace"), { headers });
};
