import { Popover } from "@ark-ui/react/popover";
import {
  Actions,
  Combo,
  DateRangeField,
  DrawerIcon,
  Select,
  toYYYMMDD,
} from "@better-giving/ui";
import { valibotResolver } from "@hookform/resolvers/valibot";
import type { FC } from "react";
import { useController, useForm } from "react-hook-form";
import { countries, country_names } from "#/constants/countries";
import type { IRegsSearchObj } from "@/reg";
import { statuses } from "./constants";
import { type FV, schema } from "./schema";

type Props = {
  onSubmit: (data: FV) => void;
  onReset: () => void;
  params: IRegsSearchObj;
};

export const Form: FC<Props> = ({ onReset, onSubmit, params }) => {
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FV>({
    resolver: valibotResolver(schema),
    values: {
      start_date: params.start_date
        ? toYYYMMDD(new Date(params.start_date))
        : "",
      end_date: params.end_date ? toYYYMMDD(new Date(params.end_date)) : "",
      country: params.country ?? "",
      status: params.status || "02",
    },
  });

  const { field: country } = useController({ name: "country", control });
  const { field: stat } = useController({ name: "status", control });
  const { field: start } = useController({ name: "start_date", control });
  const { field: end } = useController({ name: "end_date", control });

  return (
    <Popover.Content
      asChild
      className="grid content-start gap-4 w-(--reference-width) rounded border bg-popover text-popover-fg origin-(--transform-origin) data-[state=open]:animate-popup-in data-[state=closed]:animate-popup-out"
    >
      <form
        onSubmit={handleSubmit(onSubmit, (err) => {
          console.error(err);
        })}
        onReset={(e) => {
          e.preventDefault();
          reset();
          onReset();
        }}
      >
        <div className="px-6 pt-6">
          <Combo
            value={country.value || undefined}
            on_change={(c) => country.onChange(c ?? "")}
            label="Country"
            placeholder="Select a country"
            options={country_names}
            clearable
            render={(c) => (
              <>
                <span className="text-2xl">{countries[c].flag}</span>
                <span>{c}</span>
              </>
            )}
            adornment_side="start"
            adornment={(open) => {
              const flag = countries[country.value]?.flag;
              return flag ? (
                <span className="text-2xl">{flag}</span>
              ) : (
                <DrawerIcon is_open={open} size={20} />
              );
            }}
          />

          <DateRangeField
            classes="mt-4"
            startValue={start.value ?? ""}
            endValue={end.value ?? ""}
            onChange={(s, e) => {
              start.onChange(s);
              end.onChange(e);
            }}
            error={errors.start_date?.message ?? errors.end_date?.message}
          />

          <Select
            value={stat.value}
            onChange={stat.onChange}
            label="Application Status"
            classes={{
              button: "",
              options: "text-sm",
              container: "mt-4",
            }}
            options={Object.keys(statuses)}
            option_disp={(s) => (statuses as any)[s]}
          />
        </div>

        <Actions band align="split" classes="lg:mt-2">
          <button type="reset" className="text-primary underline text-sm">
            Reset filters
          </button>
          <button type="submit" className="btn btn-primary rounded font-bold">
            Apply filters
          </button>
        </Actions>
      </form>
    </Popover.Content>
  );
};
