import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { CircleAlert } from "lucide-react";
import { NavLink, useFetcher, useNavigate, useParams } from "react-router";
import { admin_ctx } from "#/.server/auth";
import { redirectWithSuccess } from "#/.server/toast";
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
  const navigate = useNavigate();
  return (
    <Dialog.Root
      open={true}
      onOpenChange={(e) => {
        if (!e.open)
          navigate("..", { preventScrollReset: true, replace: true });
      }}
    >
      <Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-fg/30 z-50" />
        <Dialog.Positioner className="contents">
          <Content />
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function Content() {
  const { form_id } = useParams();
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";

  return (
    <Dialog.Content className="z-50 fixed-center grid content-start justify-items-center bg-popover sm:w-full w-[90vw] sm:max-w-lg rounded overflow-hidden">
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
      <fetcher.Form
        method="POST"
        className="p-3 sm:px-8 sm:py-4 flex items-center justify-end gap-4 w-full text-center sm:text-right bg-muted border-t"
      >
        <input type="hidden" name="form_id" value={form_id} />
        <NavLink
          to=".."
          aria-disabled={isSubmitting}
          className="btn-secondary btn text-sm px-8 py-2"
        >
          Cancel
        </NavLink>
        <button
          disabled={isSubmitting}
          type="submit"
          className="btn btn-destructive px-8 py-2 text-sm"
        >
          Proceed
        </button>
      </fetcher.Form>
    </Dialog.Content>
  );
}
