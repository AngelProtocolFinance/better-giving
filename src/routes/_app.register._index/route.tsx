import { NavLink, useFetcher } from "react-router";
import { Separator } from "#/components/separator";
import { app_name } from "#/constants/env";
import { routes } from "#/pages/registration/routes";

const NEED_HELP_ARTICLE_ID = 6628120;

export { ErrorBoundary } from "#/components/error";
export { new_application as action } from "#/pages/registration/new-application";

export default function Page({ classes = "" }: { classes?: string }) {
  const fetcher = useFetcher();

  const openIntercomHelp = () => {
    const w = window as any;
    if ("Intercom" in w) {
      w.Intercom("showArticle", NEED_HELP_ARTICLE_ID);
    }
  };

  return (
    <fetcher.Form
      action="?index"
      method="POST"
      className={`${classes} justify-center gap-8 px-5 w-full max-w-2xl grid`}
    >
      <h3 className="text-3xl text-center">
        Register your new {app_name} nonprofit account
      </h3>

      <button
        disabled={fetcher.state !== "idle"}
        type="submit"
        className="btn btn-primary text-sm"
      >
        Start a new application
      </button>
      <Separator classes="before:mr-2 after:ml-2">OR</Separator>

      <NavLink className="btn-secondary btn text-sm" to={routes.resume}>
        Resume your registration
      </NavLink>

      <button
        type="button"
        className="underline text-primary justify-self-center text-sm"
        onClick={openIntercomHelp}
      >
        Need Help?
      </button>
    </fetcher.Form>
  );
}
