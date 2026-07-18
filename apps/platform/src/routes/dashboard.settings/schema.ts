import * as v from "valibot";
import { int_gte1 } from "@/schemas";
import { alert_pref } from "@/users/schema";

export const npo_alert_pref_update = v.object({
  npo: int_gte1,
  ...alert_pref.entries,
});

export const alert_prefs = v.pipe(
  v.array(npo_alert_pref_update),
  v.minLength(1)
);

export interface INpoAlertPrefUpdate
  extends v.InferOutput<typeof npo_alert_pref_update> {}
