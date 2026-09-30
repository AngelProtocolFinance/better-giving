import { beforeEach, describe, expect, it, vi } from "vitest";

const intent_retrieve_mock = vi.hoisted(() => vi.fn());
const donation_get_mock = vi.hoisted(() => vi.fn());
const donation_by_sttl_id_mock = vi.hoisted(() => vi.fn());
const enqueue_mock = vi.hoisted(() => vi.fn());

vi.mock("$/kit/stripe", () => ({
  stripe: { paymentIntents: { retrieve: intent_retrieve_mock } },
}));
vi.mock("$/pg/queries/donation", () => ({
  donation_get: donation_get_mock,
  donation_by_sttl_id: donation_by_sttl_id_mock,
}));
vi.mock("$/kit/queue", () => ({ enqueue: enqueue_mock }));

const { handle_refund_failed } = await import("./refund-failed");

const DON_ID = "0195c1f0-4c37-7c1a-b8f1-1f1f0a2f9d3e";

const failed_event = (amount: number) =>
  ({
    id: "evt_9",
    type: "refund.failed",
    data: {
      object: {
        id: "re_1",
        amount,
        currency: "usd",
        charge: "ch_1",
        payment_intent: "pi_1",
        status: "failed",
        failure_reason: "insufficient_funds",
      },
    },
  }) as any;

const donation = (status: string) => ({
  id: DON_ID,
  status,
  form_id: null,
  program: null,
});

/** notices handed to the queue, which retries delivery and dedupes on the id */
const queued = () =>
  enqueue_mock.mock.calls.flat().filter((m) => m.id === "fiat-notice");

beforeEach(() => {
  vi.clearAllMocks();
  enqueue_mock.mockResolvedValue(undefined);
  intent_retrieve_mock.mockResolvedValue({ id: "pi_1", metadata: {} });
});

describe("stripe refund.failed → ops alert", () => {
  it("tells finance the reversed donation's refund failed, with its amount, and undoes nothing", async () => {
    donation_by_sttl_id_mock.mockResolvedValue(donation("refunded"));

    await expect(
      handle_refund_failed(failed_event(10_000))
    ).resolves.toBeUndefined();

    expect(queued()).toHaveLength(1);
    const { alert } = queued()[0].payload;
    const text = `${alert.title}\n${alert.body}`;
    expect(text).toContain(DON_ID);
    expect(text).toContain("100.00 USD");
    expect(text).toContain("re_1");
    expect(text).toContain("insufficient_funds");
    expect(text).toMatch(/was reversed/i);
  });

  it("says the donation was not reversed when the failed refund was a partial one", async () => {
    donation_by_sttl_id_mock.mockResolvedValue(donation("settled"));

    await handle_refund_failed(failed_event(500));

    const { alert } = queued()[0].payload;
    expect(alert.body).toContain("5.00 USD");
    expect(alert.body).toMatch(/was not reversed/i);
  });

  it("keys the alert on the event, so a redelivery collapses into it", async () => {
    donation_by_sttl_id_mock.mockResolvedValue(donation("refunded"));

    await handle_refund_failed(failed_event(10_000));
    await handle_refund_failed(failed_event(10_000));

    const [first, again] = queued();
    expect(first.dedupe).toBe("fiat.notice_evt_9");
    expect(again.dedupe).toBe(first.dedupe);
  });

  // the alert is the only record finance gets, so a lost one must be redelivered
  it("fails the delivery when the alert can't be queued", async () => {
    donation_by_sttl_id_mock.mockResolvedValue(donation("refunded"));
    enqueue_mock.mockRejectedValue(new Error("qstash 503"));

    await expect(handle_refund_failed(failed_event(10_000))).rejects.toThrow(
      "qstash 503"
    );
  });
});
