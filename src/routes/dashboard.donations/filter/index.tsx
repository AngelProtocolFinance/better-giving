import { Popover } from "@ark-ui/react/popover";
import { Portal } from "@ark-ui/react/portal";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { Filter as FilterIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useController, useForm } from "react-hook-form";
import { useSearchParams } from "react-router";
import { DateRangeField } from "#/components/date-range-field";
import { toYYYMMDD } from "#/components/form";
import { DrawerIcon } from "#/components/icon";
import { weeksAgo } from "#/helpers/weeks-ago";
import { search } from "@/helpers/https";
import { type FV, schema } from "./schema";

type Props = {
  classes?: string;
  isDisabled: boolean;
};

export function Filter({ classes = "", isDisabled }: Props) {
  const [params, setParams] = useSearchParams();
  const [open, set_open] = useState(false);

  const { startDate: s, endDate: e } = search(params);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FV>({
    mode: "onChange",
    reValidateMode: "onChange",
    resolver: valibotResolver(schema),
    defaultValues: {
      //set default value so empty can be tagged as invalid
      start_date: toYYYMMDD(s ? new Date(s) : weeksAgo("now", 5)),
      end_date: toYYYMMDD(e ? new Date(e) : new Date()),
    },
  });

  const { field: start } = useController({ name: "start_date", control });
  const { field: end } = useController({ name: "end_date", control });

  async function submit({ start_date: a, end_date: b }: FV) {
    const p = new URLSearchParams(params);
    if (a) {
      p.set("startDate", a);
    } else {
      p.delete("startDate");
    }

    if (b) {
      p.set("endDate", b);
    } else {
      p.delete("endDate");
    }

    setParams(p);
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(e) => set_open(e.open)}
      positioning={{ placement: "bottom", gutter: 4 }}
    >
      <div className={`${classes} flex relative items-center`}>
        <Popover.Trigger
          disabled={isDisabled}
          className="w-full @5xl:w-[22.3rem] flex justify-center items-center p-3 rounded bg-primary text-primary-fg @5xl:text-muted-fg @5xl:bg-card @5xl:justify-between disabled:bg-muted-fg disabled:text-muted-fg @5xl:disabled:bg-muted @5xl:border focus-visible:outline-none"
        >
          <FilterIcon className="@5xl:hidden mr-1" size={16} />
          <div className="font-semibold text-sm">Filter</div>
          <DrawerIcon is_open={open} className="hidden @5xl:inline" size={21} />
        </Popover.Trigger>
      </div>

      <Portal>
        <Popover.Positioner>
          <Popover.Content
            asChild
            className="max-@5xl:fixed max-@5xl:inset-x-0 max-@5xl:top-0 z-40 grid content-start gap-4 w-(--reference-width) rounded border bg-popover text-popover-fg pb-6 @5xl:pb-0 shadow-lg @5xl:shadow-xs origin-(--transform-origin) data-[state=open]:animate-popup-in data-[state=closed]:animate-popup-out"
          >
            <form
              onSubmit={handleSubmit(submit, (err) => {
                console.error(err);
              })}
              onReset={() => {
                const p = new URLSearchParams(params);
                p.delete("startDate");
                p.delete("endDate");
                setParams(p);
              }}
            >
              <div className="@5xl:hidden relative text-xl px-4 py-3 -mb-4 font-bold uppercase">
                <span className="text-primary">Filters</span>
                <Popover.CloseTrigger className="absolute top-1/2 -translate-y-1/2 right-2">
                  <XIcon size={33} />
                </Popover.CloseTrigger>
              </div>

              <div className="px-4 @5xl:px-6 @5xl:pt-6">
                <DateRangeField
                  startValue={start.value ?? ""}
                  endValue={end.value ?? ""}
                  onChange={(s, e) => {
                    start.onChange(s);
                    end.onChange(e);
                  }}
                  error={errors.start_date?.message ?? errors.end_date?.message}
                />
              </div>

              <div className="row-start-2 flex gap-x-4 items-center justify-between px-4 py-3 p-6 @5xl:mt-2 bg-muted border-y @5xl:border-t">
                <h3 className="uppercase @5xl:hidden">Filter by</h3>
                <button
                  type="reset"
                  className="text-primary underline text-sm ml-auto @5xl:ml-0"
                >
                  Reset filters
                </button>
                <button
                  type="submit"
                  className="btn btn btn-primary px-6 py-2 rounded text-xs font-bold"
                >
                  Submit
                </button>
              </div>
            </form>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
