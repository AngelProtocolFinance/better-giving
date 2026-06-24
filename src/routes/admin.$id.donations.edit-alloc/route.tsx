import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { Switch } from "@ark-ui/react/switch";
import { useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import { use_admin_data } from "#/pages/admin/use-admin-data";
import type { EndowmentUpdate } from "#/services/types";
import { default_allocation } from "@/constants/common";
import type { IAllocation } from "@/donations";
import { alloc_opts, to_alloc_opt_value } from "./common";
import { AllocationOptions } from "./options";
import { AllocationSlider } from "./slider";

export default function AllocationEdit() {
  const data = use_admin_data();
  const navigate = useNavigate();
  return (
    <Dialog.Root
      open={true}
      onOpenChange={(e) => {
        if (!e.open)
          navigate("..", { replace: true, preventScrollReset: true });
      }}
    >
      <Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-fg/30 z-50" />
        <Dialog.Positioner className="contents">
          <Content {...(data?.endow.allocation ?? default_allocation)} />
        </Dialog.Positioner>
      </Portal>
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
    <Dialog.Content className="z-50 fixed-center grid gap-y-4 bg-popover sm:w-full w-[90vw] sm:max-w-lg rounded p-6 max-h-[90dvh] overflow-y-scroll scrollbar-thin scrollbar-thumb-ring scrollbar-track-border">
      <h4>Choose allocation</h4>

      <AllocationOptions
        value={alloc}
        onChange={(v) => {
          set_is_custom(false);
          set_alloc(v);
        }}
      />

      <Switch.Root
        checked={is_custom}
        onCheckedChange={(e) => set_is_custom(e.checked)}
        className="flex items-center gap-x-2 mt-4"
      >
        <Switch.Control className="group relative flex h-6 w-10 rounded-full bg-muted p-1 transition-colors duration-200 ease-in-out focus:outline-hidden data-focus-visible:outline-1 data-focus-visible:outline-white data-[state=checked]:bg-primary shadow-inner">
          <Switch.Thumb className="pointer-events-none inline-block size-4 translate-x-0 rounded-full bg-card ring-0 shadow-lg transition duration-200 ease-in-out group-data-[state=checked]:translate-x-4" />
        </Switch.Control>
        <Switch.Label>Set custom allocation</Switch.Label>
        <Switch.HiddenInput />
      </Switch.Root>
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
    </Dialog.Content>
  );
}
