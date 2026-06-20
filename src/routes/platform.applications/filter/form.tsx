import { Popover } from "@ark-ui/react/popover";
import { valibotResolver } from "@hookform/resolvers/valibot";
import type { FC } from "react";
import { useController, useForm } from "react-hook-form";
import { Combo } from "#/components/combo";
import { DateRangeField } from "#/components/date-range-field";
import { toYYYMMDD } from "#/components/form";
import { DrawerIcon } from "#/components/icon";
import { Select } from "#/components/selector/select";
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
            value={country.value}
            onChange={country.onChange}
            label="Country"
            placeholder="Select a country"
            options={country_names}
            classes={{ input: "pl-12" }}
            option_disp={(c) => (
              <>
                <span className="text-2xl">{countries[c].flag}</span>
                <span>{c}</span>
              </>
            )}
            btn_disp={(c, open) => {
              const flag = countries[c]?.flag;
              return flag ? (
                <span data-flag className="text-2xl">
                  {flag}
                </span>
              ) : (
                <DrawerIcon
                  is_open={open}
                  size={20}
                  className="justify-self-end shrink-0"
                />
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

        <div className="flex gap-x-4 items-center justify-between p-6 lg:mt-2 bg-muted border-t">
          <button type="reset" className="text-primary underline text-sm">
            Reset filters
          </button>
          <button
            type="submit"
            className="btn btn btn-primary px-6 py-2 rounded text-xs font-bold"
          >
            Apply filters
          </button>
        </div>
      </form>
    </Popover.Content>
  );
};
