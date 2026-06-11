import { Dialog } from "@base-ui/react/dialog";
import { Field } from "@base-ui/react/field";
import { Switch } from "@base-ui/react/switch";
import { useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import { use_admin_data } from "#/pages/admin/use-admin-data";
import type { EndowmentUpdate } from "#/services/types";
import { default_allocation } from "@/constants/common";
import type { IAllocation } from "@/npo";
import { alloc_opts, to_alloc_opt_value } from "./common";
import { AllocationOptions } from "./options";
import { AllocationSlider } from "./slider";

export default function AllocationEdit() {
  const data = use_admin_data();
  const navigate = useNavigate();
  return (
    <Dialog.Root
      open={true}
      onOpenChange={(open) => {
        if (!open) navigate("..", { replace: true, preventScrollReset: true });
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-fg/30 z-50" />
        <Content {...(data?.endow.allocation ?? default_allocation)} />
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Content(props: IAllocation) {
  const fetcher = useFetcher();
  const [alloc, set_alloc] = useState<IAllocation>(props);
  const [is_custom, set_is_custom] = useState(
    alloc_opts.every((opt) => opt.value !== to_alloc_opt_value(props))
  );

  const is_loading = fetcher.state !== "idle";

  return (
    <Dialog.Popup className="z-50 fixed-center grid gap-y-4 bg-popover sm:w-full w-[90vw] sm:max-w-lg rounded p-6 max-h-[90dvh] overflow-y-scroll scrollbar-thin scrollbar-thumb-ring scrollbar-track-border">
      <h4>Choose allocation</h4>

      <AllocationOptions
        value={alloc}
        onChange={(v) => {
          set_is_custom(false);
          set_alloc(v);
        }}
      />

      <Field.Root className="flex items-center gap-x-2 mt-4">
        <Switch.Root
          checked={is_custom}
          onCheckedChange={set_is_custom}
          className="group relative flex h-6 w-10 rounded-full bg-muted p-1 transition-colors duration-200 ease-in-out focus:outline-hidden data-focus:outline-1 data-focus:outline-white data-checked:bg-primary shadow-inner"
        >
          <Switch.Thumb className="pointer-events-none inline-block size-4 translate-x-0 rounded-full bg-card ring-0 shadow-lg transition duration-200 ease-in-out group-data-checked:translate-x-4" />
        </Switch.Root>
        <Field.Label>Set custom allocation</Field.Label>
      </Field.Root>
      {is_custom && (
        <AllocationSlider
          disabled={is_loading}
          value={alloc}
          onChange={(v) => set_alloc(v)}
        />
      )}

      <button
        disabled={is_loading}
        type="button"
        className="btn btn btn-primary px-4 py-2 text-sm mt-4 rounded"
        onClick={async () => {
          const update: EndowmentUpdate = { allocation: alloc };
          fetcher.submit(update, {
            method: "PATCH",
            action: "..",
            encType: "application/json",
          });
        }}
      >
        {is_loading ? "Updating.." : "Save"}
      </button>
    </Dialog.Popup>
  );
}
