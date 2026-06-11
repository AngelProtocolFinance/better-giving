import { endOfDay } from "date-fns";

export { endOfDay, startOfDay } from "date-fns";

import * as v from "valibot";

export const iso_date = (formatter: typeof endOfDay, required?: "required") =>
  v.lazy((x) => {
    if (!x) {
      return required === "required"
        ? v.pipe(v.string(), v.nonEmpty("required"))
        : v.string();
    }

    return v.pipe(
      v.string(),
      v.transform((v) => new Date(v)),
      v.date("invalid date"),
      v.maxValue(endOfDay(new Date()), "can't be later than today"),
      v.transform((x) => formatter(x).toISOString())
    );
  });
