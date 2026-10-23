import type { IFiatNoticePayload } from "@/queue";
import { fiat_monitor } from "$/kit/slack";

export async function handle_fiat_notice({ alert }: IFiatNoticePayload) {
  await fiat_monitor.send_alert(alert);
}
