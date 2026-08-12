import { parseFormData } from "remix-hook-form";
import { get_session, to_auth } from "#/.server/auth";
import { reg_cookie } from "#/.server/cookie";
import { new_application } from "#/pages/registration/new-application";
import { resume_application } from "#/pages/registration/resume-application";
import type { Route } from "./+types/route";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const { user } = await get_session(request);
  if (!user) return to_auth(request);

  const rc = await reg_cookie
    .parse(request.headers.get("cookie"))
    .then((x) => x || {});
  return { reference: rc.reference ?? "" };
};

/** the screen has two independent submissions — starting an application and
 * resuming one — each driven by its own fetcher so their errors and pending
 * states never bleed into one another. `intent` picks the handler. */
export const action = async ({ request }: Route.ActionArgs) => {
  const fd = await request.formData();
  const { intent } = await parseFormData<{ intent?: string }>(fd);

  if (intent === "resume") return resume_application(request, fd);
  return new_application(request, fd);
};
