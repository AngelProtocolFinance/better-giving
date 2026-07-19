import { endOfDay, startOfDay } from "date-fns";
import * as v from "valibot";
import { $num_gt0_fn } from "../schemas";
import { iso_date } from "../schemas/date";

// form values schema — $num_gt0_fn transforms string input to number
const interest_log_fv = v.object({
  date_created: iso_date(endOfDay, "required"),
  total: $num_gt0_fn({ required: true }),
  date_start: iso_date(startOfDay, "required"),
  date_end: iso_date(endOfDay, "required"),
});

// form values — total is string|number due to valibot lazy transform
export type IInterestLogFV = v.InferOutput<typeof interest_log_fv>;

// db-facing — total is always number after validation
export interface IInterestLog extends Omit<IInterestLogFV, "total"> {
  total: number;
}

export const interest_log = v.pipe(
  interest_log_fv,
  v.forward(
    v.partialCheck(
      [["date_start"], ["date_end"]],
      ({ date_start: a, date_end: b }) => {
        return a && b ? a <= b : true;
      },
      "start date must be earlier than end date"
    ),
    ["date_start"]
  )
);
