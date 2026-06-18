import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { CheckCircle2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import type { Route } from "./+types/route";
import type { action, loader } from "./api";
import { SettleForm } from "./form";
import { Preview } from "./preview";
import type { IFormValues } from "./types";

export { action, loader } from "./api";

type Step = "form" | "preview" | "done";

const defaults: IFormValues = {
  from: "cheque",
  npo: undefined,
  donor_name: "",
  donor_email: "settlement@better.giving",
  net: "",
  reference: "",
};

export default function Page(_: Route.ComponentProps) {
  const navigate = useNavigate();
  const close = () =>
    navigate("..", { preventScrollReset: true, replace: true });

  return (
    <Dialog.Root
      open
      onOpenChange={(e) => {
        if (!e.open) close();
      }}
    >
      <Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-fg/30 z-50" />
        <Dialog.Positioner className="contents">
          <Dialog.Content className="z-50 fixed-center bg-popover w-full max-w-3xl max-h-[90vh] rounded overflow-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border">
            <Content on_close={close} />
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function Content({ on_close }: { on_close: () => void }) {
  const submit_fetcher = useFetcher<typeof action>();
  const preview_fetcher = useFetcher<typeof loader>();
  const awaiting_preview = useRef(false);
  const [step, set_step] = useState<Step>("form");
  const [form, set_form] = useState<IFormValues>(defaults);

  const submitting = submit_fetcher.state !== "idle";
  const loading_preview = preview_fetcher.state !== "idle";

  useEffect(() => {
    if (step === "preview" && submit_fetcher.data?.ok) set_step("done");
  }, [step, submit_fetcher.data]);

  // transition to preview when preview data arrives
  useEffect(() => {
    if (
      awaiting_preview.current &&
      preview_fetcher.state === "idle" &&
      preview_fetcher.data?.preview
    ) {
      awaiting_preview.current = false;
      set_step("preview");
    }
  }, [preview_fetcher.data, preview_fetcher.state]);

  const handle_preview = (values: IFormValues) => {
    set_form(values);
    const params = new URLSearchParams({
      npo_id: values.npo!.id.toString(),
      net: values.net,
    });
    awaiting_preview.current = true;
    preview_fetcher.load(`?${params}`);
  };

  if (step === "done") {
    return (
      <div className="p-6 sm:p-8 text-center">
        <CheckCircle2Icon className="mx-auto mb-3 text-success" size={40} />
        <h3 className="text-lg font-bold mb-1">Settlement created</h3>
        <p className="text-sm text-muted-fg mb-4">
          Settlement for ${form.net} to {form.npo?.name} has been recorded.
        </p>
        <button
          type="button"
          onClick={on_close}
          className="btn btn-primary px-8 py-2 text-sm"
        >
          Close
        </button>
      </div>
    );
  }

  if (step === "preview") {
    const npo = form.npo;
    const preview = preview_fetcher.data?.preview;
    if (!npo || !preview) return null;
    return (
      <Preview
        form={form}
        preview={preview}
        submitting={submitting}
        error={
          submit_fetcher.data && !submit_fetcher.data.ok
            ? submit_fetcher.data.error
            : null
        }
        on_back={() => set_step("form")}
        on_confirm={() =>
          submit_fetcher.submit(
            {
              from: form.from,
              npo_id: npo.id.toString(),
              donor_name: form.donor_name || "",
              donor_email: form.donor_email,
              net: form.net,
              reference: form.reference,
            },
            { method: "post" }
          )
        }
      />
    );
  }

  return (
    <SettleForm
      defaults={form}
      loading={loading_preview}
      on_preview={handle_preview}
      on_close={on_close}
    />
  );
}
