import { Popover } from "@ark-ui/react/popover";
import { Portal } from "@ark-ui/react/portal";
import { FilterIcon } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { parse } from "valibot";
import { DrawerIcon } from "#/components/icon";
import { search } from "@/helpers/https";
import { regs_search } from "@/reg/schema";
import { Form } from "./form";
import type { FV } from "./schema";

type Props = {
  classes?: string;
  isDisabled: boolean;
};

export function Filter({ classes = "", isDisabled }: Props) {
  const [params, setParams] = useSearchParams();
  const [open, set_open] = useState(false);
  const parsed = parse(regs_search, search(params));

  async function onSubmit(fv: FV) {
    const copy = new URLSearchParams(params);
    for (const k of ["status", "country", "start_date", "end_date"] as const) {
      const val = fv[k];
      // always set status so "" (all) reaches the loader
      if (val || k === "status") copy.set(k, val ?? "");
      else copy.delete(k);
    }
    // preserve search query and sort across filter changes
    for (const k of ["query", "sort_key", "sort_dir"]) {
      const v = params.get(k);
      if (v) copy.set(k, v);
    }
    setParams(copy);
  }

  return (
    <div className={`${classes} flex relative items-center`}>
      <Popover.Root
        open={open}
        onOpenChange={(e) => set_open(e.open)}
        positioning={{ placement: "bottom", gutter: 4 }}
      >
        <Popover.Trigger
          disabled={isDisabled}
          className="w-full flex justify-center items-center p-3 rounded bg-primary text-primary-fg lg:text-muted-fg lg:bg-input lg:border lg:w-[22.3rem] lg:justify-between disabled:bg-muted-fg disabled:text-muted-fg lg:disabled:bg-muted focus-visible:outline-none"
        >
          <FilterIcon className="mr-1 lg:hidden" size={16} />
          <div className="font-semibold text-sm">Filter</div>
          <DrawerIcon is_open={open} className="hidden lg:inline" size={21} />
        </Popover.Trigger>

        <Portal>
          <Popover.Positioner>
            <Form
              params={parsed}
              onSubmit={onSubmit}
              onReset={() => setParams({ status: "02" })}
            />
          </Popover.Positioner>
        </Portal>
      </Popover.Root>
    </div>
  );
}
