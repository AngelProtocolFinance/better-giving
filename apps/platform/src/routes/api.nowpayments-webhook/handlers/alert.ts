import { report_error } from "#/errors/report";
import type { Alert } from "@/slack";
import { stage } from "$/env";
import { aws_monitor } from "$/kit/slack";

/** never rejects: a slack outage must not 500 an ipn that already wrote */
export const alert = (a: Omit<Alert, "from">): Promise<void> =>
  Promise.resolve()
    .then(() =>
      aws_monitor.send_alert({ from: `nowpayments-webhook-${stage}`, ...a })
    )
    .then(() => undefined)
    .catch((err) => report_error(err, { title: a.title, body: a.body }));

export const alert_all = async (as: Omit<Alert, "from">[]): Promise<void> => {
  await Promise.all(as.map(alert));
};
