import { beforeEach, describe, expect, test, vi } from "vitest";

const send_alert = vi.hoisted(() => vi.fn());
vi.mock("$/kit/discord", () => ({ fiat_monitor: { send_alert } }));

import { handle_fiat_notice } from "./handle-fiat-notice";

const alert = {
  type: "NOTICE" as const,
  from: "charge-refunded-test",
  title: "Reversal Complete: Undo Hand Adjustment",
  body: "Reversal complete: undo the hand adjustment",
};

beforeEach(() => {
  send_alert.mockReset();
});

describe("handle_fiat_notice", () => {
  test("posts the queued notice to the fiat channel", async () => {
    send_alert.mockResolvedValue(undefined);

    await handle_fiat_notice({ id: "evt_1", alert });

    expect(send_alert).toHaveBeenCalledExactlyOnceWith(alert);
  });

  test("a refused post throws, so qstash retries it", async () => {
    send_alert.mockRejectedValue(new Error("discord 503"));

    await expect(handle_fiat_notice({ id: "evt_1", alert })).rejects.toThrow(
      "discord 503"
    );
  });
});
