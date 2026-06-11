import { Popover } from "@base-ui/react/popover";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { Filter as FilterIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router";
import { Field, toYYYMMDD } from "#/components/form";
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
    register,
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
    <Popover.Root open={open} onOpenChange={set_open}>
      <div className={`${classes} flex relative items-center`}>
        <Popover.Trigger
          disabled={isDisabled}
          className="w-full @5xl:w-[22.3rem] flex justify-center items-center p-3 rounded bg-primary text-primary-fg @5xl:text-muted-fg @5xl:bg-card @5xl:justify-between disabled:bg-muted-fg disabled:text-muted-fg @5xl:disabled:bg-muted @5xl:border"
        >
          <FilterIcon className="@5xl:hidden mr-1" size={16} />
          <div className="font-semibold text-sm">Filter</div>
          <DrawerIcon is_open={open} className="hidden @5xl:inline" size={21} />
        </Popover.Trigger>
      </div>

      <Popover.Portal>
        <Popover.Positioner side="bottom" sideOffset={4}>
          <Popover.Popup
            render={
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
              />
            }
            className="max-@5xl:fixed max-@5xl:inset-x-0 max-@5xl:top-0 z-40 grid content-start gap-4 w-[var(--anchor-width)] rounded border bg-popover text-popover-fg pb-6 @5xl:pb-0 shadow-lg @5xl:shadow-xs origin-[var(--transform-origin)] transition-[opacity,scale] duration-150 data-[starting-style]:opacity-0 data-[starting-style]:scale-90 data-[ending-style]:opacity-0 data-[ending-style]:scale-90"
          >
            <div className="@5xl:hidden relative text-xl px-4 py-3 -mb-4 font-bold uppercase">
              <span className="text-primary">Filters</span>
              <Popover.Close className="absolute top-1/2 -translate-y-1/2 right-2">
                <XIcon size={33} />
              </Popover.Close>
            </div>

            <div className="grid gap-x-[1.125rem] grid-cols-2 px-4 @5xl:px-6 @5xl:pt-6">
              <p className="col-span-full text-sm mb-2">Date</p>
              <Field
                label=""
                type="date"
                {...register("start_date")}
                error={errors.start_date?.message}
              />
              <Field
                label=""
                type="date"
                {...register("end_date")}
                error={errors.end_date?.message}
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
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
