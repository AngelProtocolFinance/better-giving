import { CircleAlert } from "lucide-react";
import { NavLink, useFetcher, useParams } from "react-router";
import { admin_ctx } from "#/.server/auth";
import { redirectWithSuccess } from "#/.server/toast";
import { RouteModal } from "#/components/route-modal";
import { resp } from "@/helpers/https";
import { form_get, form_update } from "$/pg/queries/form";

export { ErrorModal as ErrorBoundary } from "#/components/error";

export const action = async (x: {
  params: { form_id?: string };
  context: { get: (key: typeof admin_ctx) => number };
}) => {
  const { form_id } = x.params;
  if (!form_id) return resp.status(400, "form_id required");

  const form = await form_get(form_id);
  if (!form) return resp.status(404, "form not found");

  const npo_id = x.context.get(admin_ctx);
  if (form.owner_npo_id !== npo_id) return resp.status(403, "not authorized");

  await form_update(form_id, { status: "inactive" });
  return redirectWithSuccess("..", "Form deactivated");
};

export default function DisablePrompt() {
  return (
    <RouteModal classes="grid content-start justify-items-center bg-popover">
      <Content />
    </RouteModal>
  );
}

function Content() {
  const { form_id } = useParams();
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";

  return (
    <>
      <div className="relative w-full">
        <p className="sm:text-xl font-bold text-center border-b bg-muted p-5">
          Disable form
        </p>
      </div>
      <CircleAlert size={80} className="mt-6 text-destructive" />
      <div className="p-6 text-center text-muted-fg">
        Are you sure you want to disable this form? It will no longer accept
        donations.
      </div>
      <fetcher.Form method="POST" className="modal-actions">
        <input type="hidden" name="form_id" value={form_id} />
        <NavLink
          to=".."
          aria-disabled={isSubmitting}
          className="btn-secondary btn"
        >
          Cancel
        </NavLink>
        <button
          disabled={isSubmitting}
          type="submit"
          className="btn btn-destructive"
        >
          Proceed
        </button>
      </fetcher.Form>
    </>
  );
}
