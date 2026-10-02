import { PayPalApiError } from "@better-giving/paypal";
import Stripe from "stripe";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { TestDb } from "$/pg/test-utils/pglite";

const cancel_subscription_mock = vi.hoisted(() => vi.fn());
const get_subscription_mock = vi.hoisted(() => vi.fn());
const stripe_retrieve_mock = vi.hoisted(() => vi.fn());
const stripe_cancel_mock = vi.hoisted(() => vi.fn());

vi.mock("$/kit/paypal", () => ({
  paypal: {
    cancel_subscription: cancel_subscription_mock,
    get_subscription: get_subscription_mock,
  },
}));
vi.mock("$/kit/stripe", () => ({
  stripe: {
    subscriptions: {
      retrieve: stripe_retrieve_mock,
      cancel: stripe_cancel_mock,
    },
  },
}));

const send_alert_mock = vi.hoisted(() => vi.fn());
vi.mock("$/kit/discord", () => ({
  fiat_monitor: { send_alert: send_alert_mock },
}));
vi.mock("#/errors/report", () => ({ report_error: vi.fn() }));

const send_email_mock = vi.hoisted(() => vi.fn());
vi.mock("$/email", () => ({ send_email_or_throw: send_email_mock }));

const enqueue_mock = vi.hoisted(() => vi.fn());
vi.mock("$/kit/queue", () => ({ enqueue: enqueue_mock }));

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
vi.mock("$/pg/db", () => ({
  db: new Proxy(
    {},
    {
      get(_, prop) {
        const real = test_db.current?.db;
        if (!real) throw new Error("test_db not initialized");
        return (real as any)[prop];
      },
    }
  ),
}));

const { handle_sub_cancel_failed_email, handle_sub_deactivated } = await import(
  "./handle-subscription"
);
const { sub_get } = await import("$/pg/queries/subscription");
const { subscriptions } = await import("$/pg/schema/subscription");
const { npos } = await import("$/pg/schema/npo");
const { seed_npo } = await import("#/__tests__/fixtures/funds");

beforeAll(async () => {
  const { create_test_db } = await import("$/pg/test-utils/pglite");
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

const cancel_on_paypal = async (status_cancel_reason: string | null) => {
  await handle_sub_deactivated({
    id: "I-SUB1",
    platform: "paypal",
    status_cancel_reason,
  });
  return cancel_subscription_mock.mock.calls[0]![1].reason as string;
};

beforeEach(() => {
  vi.clearAllMocks();
  cancel_subscription_mock.mockResolvedValue(undefined);
  send_alert_mock.mockResolvedValue(undefined);
  enqueue_mock.mockResolvedValue(undefined);
  send_email_mock.mockResolvedValue({
    data: { id: "email-1", response: "250 ok" },
    error: null,
  });
});

describe("handle_sub_deactivated paypal cancel reason", () => {
  it("sends a multi-line reason as one line", async () => {
    const reason = await cancel_on_paypal(
      "Moving abroad.\r\n\n  Please stop\tbilling me.\n"
    );
    expect(reason).toBe("Moving abroad. Please stop billing me.");
  });

  // line terminators java's `.` excludes, so `^.*$` fails on them at paypal
  it.each([
    ["next line", "\u0085"],
    ["line separator", "\u2028"],
    ["paragraph separator", "\u2029"],
  ])("replaces a %s with a space", async (_, terminator) => {
    const reason = await cancel_on_paypal(`Too expensive.${terminator}Bye`);
    expect(reason).toBe("Too expensive. Bye");
  });

  it("caps a 200-character reason at paypal's 128", async () => {
    const reason = await cancel_on_paypal("x".repeat(200));
    expect(reason).toBe("x".repeat(128));
  });

  it.each([
    // 3 bytes per character: 42 fit in 128
    ["a japanese reason", "解約します。".repeat(20), "解約します。".repeat(7)],
    // precomposed é, 2 bytes each: 64 fit in 128
    ["an accented reason", "é".repeat(100), "é".repeat(64)],
  ])("caps %s at 128 utf-8 bytes", async (_, given, expected) => {
    const reason = await cancel_on_paypal(given);
    expect(reason).toBe(expected);
    expect(new TextEncoder().encode(reason).length).toBeLessThanOrEqual(128);
  });

  it("drops the trailing space a cut at a word gap leaves", async () => {
    const reason = await cancel_on_paypal(`${"a".repeat(127)}\n\nbbbb`);
    expect(reason).toBe("a".repeat(127));
  });

  it.each([
    ["no reason", null],
    ["a blank reason", " \n\t "],
  ])("sends a fixed reason for %s", async (_, given) => {
    const reason = await cancel_on_paypal(given);
    expect(reason).toBe("no reason provided");
  });

  // each suffix is one grapheme crossing byte 128
  it.each([
    ["an emoji", 127, "😀"],
    ["a flag", 121, "🇯🇵"],
    ["an accented e", 126, "e\u0301"],
  ])("never splits %s at the cut", async (_, pad, suffix) => {
    const reason = await cancel_on_paypal(`${"a".repeat(pad)}${suffix}`);
    expect(reason).toBe("a".repeat(pad));
  });
});

describe("handle_sub_deactivated paypal cancel failures", () => {
  const paypal_answers = (http_status: number, issue: string) =>
    cancel_subscription_mock.mockRejectedValue(
      new PayPalApiError(
        "cancel subscription",
        http_status,
        JSON.stringify({ name: "ERR", details: [{ issue }] })
      )
    );
  const deactivate = () =>
    handle_sub_deactivated({
      id: "I-SUB1",
      platform: "paypal",
      status_cancel_reason: null,
    });

  // already cancelled (or never approved) inside paypal: nothing left to stop
  it("resolves on a subscription paypal can no longer cancel", async () => {
    paypal_answers(422, "SUBSCRIPTION_STATUS_INVALID");

    await expect(deactivate()).resolves.toBeUndefined();
    expect(send_alert_mock).not.toHaveBeenCalled();
  });

  it.each([408, 409, 429])(
    "rethrows a %i so the queue retries it",
    async (http_status) => {
      paypal_answers(http_status, "ERR");

      await expect(deactivate()).rejects.toThrow();
      expect(send_alert_mock).not.toHaveBeenCalled();
    }
  );

  it.each([408, 409, 429])(
    "alerts ops on a %i when no retry is left, and resolves",
    async (http_status) => {
      paypal_answers(http_status, "ERR");

      await expect(
        handle_sub_deactivated(
          { id: "I-SUB1", platform: "paypal", status_cancel_reason: null },
          { last: true }
        )
      ).resolves.toBeUndefined();
      expect(send_alert_mock).toHaveBeenCalledOnce();
    }
  );

  // the donor was told they're no longer charged; a retry can't change this answer
  it("alerts ops on a refusal a retry can't change, and resolves", async () => {
    paypal_answers(404, "INVALID_RESOURCE_ID");

    await expect(deactivate()).resolves.toBeUndefined();
    expect(send_alert_mock).toHaveBeenCalledOnce();
    expect(JSON.stringify(send_alert_mock.mock.calls[0]![0])).toContain(
      "I-SUB1"
    );
  });

  it("throws on a paypal outage, so qstash retries", async () => {
    paypal_answers(503, "SERVICE_UNAVAILABLE");

    await expect(deactivate()).rejects.toThrow("503");
    expect(send_alert_mock).not.toHaveBeenCalled();
  });
});

describe("handle_sub_deactivated stripe cancel", () => {
  const SUB_ID = "sub_stripe1";

  /** stripe as it behaves for one sub in `live_status`: cancel on an ended sub errors */
  const stripe_with = (live_status: string) => {
    stripe_retrieve_mock.mockImplementation(async (id: string) => {
      if (id !== SUB_ID) throw new Error(`No such subscription: '${id}'`);
      return { id, status: live_status };
    });
    stripe_cancel_mock.mockImplementation(async (id: string) => {
      if (live_status === "canceled")
        throw new Error("subscription is already canceled");
      return { id, status: "canceled" };
    });
  };

  const deactivate = () =>
    handle_sub_deactivated({
      id: SUB_ID,
      platform: "stripe",
      status_cancel_reason: "moving abroad",
    });

  it("cancels a live subscription with the donor's reason", async () => {
    stripe_with("active");

    await deactivate();

    expect(stripe_cancel_mock).toHaveBeenCalledExactlyOnceWith(SUB_ID, {
      cancellation_details: { comment: "moving abroad" },
    });
  });

  it("caps the donor's reason at stripe's 5000, without splitting an emoji", async () => {
    stripe_with("active");

    await handle_sub_deactivated({
      id: SUB_ID,
      platform: "stripe",
      status_cancel_reason: `${"a".repeat(4998)}😀 and more`,
    });

    const { comment } =
      stripe_cancel_mock.mock.calls[0]![1].cancellation_details;
    expect(comment).toBe("a".repeat(4998));
  });

  it("resolves on a subscription stripe already canceled", async () => {
    stripe_with("canceled");

    await expect(deactivate()).resolves.toBeUndefined();
    expect(stripe_cancel_mock).not.toHaveBeenCalled();
  });

  it("alerts ops on a refusal a retry can't change, and resolves", async () => {
    stripe_retrieve_mock.mockRejectedValue(
      new Stripe.errors.StripeInvalidRequestError({
        type: "invalid_request_error",
        code: "resource_missing",
        statusCode: 404,
        message: `No such subscription: '${SUB_ID}'`,
      })
    );

    await expect(deactivate()).resolves.toBeUndefined();
    expect(send_alert_mock).toHaveBeenCalledOnce();
    expect(JSON.stringify(send_alert_mock.mock.calls[0]![0])).toContain(SUB_ID);
  });

  it("throws on a stripe outage, so qstash retries", async () => {
    stripe_retrieve_mock.mockRejectedValue(
      new Stripe.errors.StripeAPIError({
        type: "api_error",
        statusCode: 500,
        message: "stripe is down",
      })
    );

    await expect(deactivate()).rejects.toThrow("stripe is down");
    expect(send_alert_mock).not.toHaveBeenCalled();
  });
});

describe("a donor's cancel the provider refuses for good", () => {
  const DONOR = "ada@test.com";
  const REASON = "moving abroad";
  /** the donor's cancel stamps the row; the producer carries the stamp */
  const CANCELLED_AT = "2026-10-01T00:00:00.000Z";

  /** the row as the donor's cancel leaves it */
  const seed_cancelled = async (
    id: string,
    platform: "stripe" | "paypal",
    status_cancel_reason = REASON
  ) => {
    const db = test_db.current!.db;
    await db.delete(subscriptions);
    await db.delete(npos);
    const npo = await seed_npo(db);
    await db.insert(subscriptions).values({
      id,
      interval: "month",
      interval_count: 1,
      next_billing: "2026-11-01T00:00:00.000Z",
      amount: 25,
      amount_usd: 25,
      currency: "USD",
      product_id: "prod_1",
      to_npo_id: npo!.id,
      to_name: "Save The Rainforest",
      platform,
      status: "inactive",
      status_cancel_reason,
      from_id: DONOR,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: CANCELLED_AT,
    });
  };

  const paypal_error = (http_status: number) =>
    new PayPalApiError(
      "cancel subscription",
      http_status,
      JSON.stringify({ name: "ERR", details: [{ issue: "ERR" }] })
    );

  /** paypal refuses the cancel while the subscription bills on */
  const paypal_refuses = (http_status = 400, live_status = "ACTIVE") => {
    cancel_subscription_mock.mockRejectedValue(paypal_error(http_status));
    get_subscription_mock.mockResolvedValue({ status: live_status });
  };

  /** stripe refuses the cancel of a sub in `live_status` */
  const stripe_refuses = (live_status = "active") => {
    stripe_retrieve_mock.mockResolvedValue({
      id: "sub_donor1",
      status: live_status,
    });
    stripe_cancel_mock.mockRejectedValue(
      new Stripe.errors.StripeInvalidRequestError({
        type: "invalid_request_error",
        code: "status_transition_invalid",
        statusCode: 400,
        message: "cannot cancel",
      })
    );
  };

  const donor_cancelled = (id: string, platform: "stripe" | "paypal") => ({
    id,
    platform,
    status_cancel_reason: REASON,
    by_donor: true as const,
    updated_at: CANCELLED_AT,
  });

  const alert_body = (n = 0) =>
    send_alert_mock.mock.calls[n]![0].body as string;

  /** the donor-email messages the handler enqueued */
  const queued_emails = () =>
    enqueue_mock.mock.calls
      .flat()
      .filter((m) => m.id === "sub-cancel-failed-email");

  it("puts a paypal subscription back to active and queues the donor's email", async () => {
    await seed_cancelled("I-SUB1", "paypal");
    paypal_refuses();

    await expect(
      handle_sub_deactivated(donor_cancelled("I-SUB1", "paypal"))
    ).resolves.toBeUndefined();

    const row = await sub_get("I-SUB1");
    expect(row?.status).toBe("active");
    expect(row?.status_cancel_reason).toBeNull();
    expect(queued_emails()).toEqual([
      expect.objectContaining({
        payload: {
          id: "I-SUB1",
          cancelled_at: CANCELLED_AT,
          to: DONOR,
          to_name: "Save The Rainforest",
          amount: 25,
          amount_usd: 25,
          currency: "USD",
          interval: "month",
          interval_count: 1,
        },
        retries: 3,
      }),
    ]);
    expect(alert_body()).toContain("the donor's email was queued");
    expect(alert_body()).toContain("Cancel I-SUB1 in the paypal dashboard.");
  });

  it("puts a stripe subscription back to active and queues the donor's email", async () => {
    await seed_cancelled("sub_donor1", "stripe");
    stripe_refuses();

    await expect(
      handle_sub_deactivated(donor_cancelled("sub_donor1", "stripe"))
    ).resolves.toBeUndefined();

    const row = await sub_get("sub_donor1");
    expect(row?.status).toBe("active");
    expect(row?.status_cancel_reason).toBeNull();
    expect(queued_emails()).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({ id: "sub_donor1", to: DONOR }),
      }),
    ]);
    expect(alert_body()).toContain(
      "Cancel sub_donor1 in the stripe dashboard."
    );
  });

  // unpaid closes its invoices unattempted; incomplete's first payment never cleared
  it.each(["unpaid", "incomplete"])(
    "leaves the row cancelled when the stripe subscription is %s",
    async (live_status) => {
      await seed_cancelled("sub_donor1", "stripe");
      stripe_refuses(live_status);

      await handle_sub_deactivated(donor_cancelled("sub_donor1", "stripe"));

      expect((await sub_get("sub_donor1"))?.status).toBe("inactive");
      expect(enqueue_mock).not.toHaveBeenCalled();
      expect(alert_body()).toContain(
        `isn't billing at stripe (${live_status})`
      );
      expect(alert_body()).not.toContain("dashboard");
    }
  );

  // suspended after failed payments: paypal charges nothing until reactivated
  it("leaves the row cancelled when the paypal subscription is suspended", async () => {
    await seed_cancelled("I-SUB1", "paypal");
    paypal_refuses(400, "SUSPENDED");

    await handle_sub_deactivated(donor_cancelled("I-SUB1", "paypal"));

    expect((await sub_get("I-SUB1"))?.status).toBe("inactive");
    expect(enqueue_mock).not.toHaveBeenCalled();
    expect(alert_body()).toContain("isn't billing at paypal (SUSPENDED)");
    expect(alert_body()).not.toContain("dashboard");
  });

  // a closed payer account is a final refusal like any other: the live read decides
  it("restores the row when paypal refuses over a closed payer account but still reads it active", async () => {
    await seed_cancelled("I-SUB1", "paypal");
    cancel_subscription_mock.mockRejectedValue(
      new PayPalApiError(
        "cancel subscription",
        422,
        JSON.stringify({
          name: "UNPROCESSABLE_ENTITY",
          details: [{ issue: "USER_ACCOUNT_CLOSED" }],
        })
      )
    );
    get_subscription_mock.mockResolvedValue({ status: "ACTIVE" });

    await handle_sub_deactivated(donor_cancelled("I-SUB1", "paypal"));

    expect(get_subscription_mock).toHaveBeenCalledOnce();
    expect((await sub_get("I-SUB1"))?.status).toBe("active");
    expect(queued_emails()).toHaveLength(1);
    expect(alert_body()).toContain("paypal answered USER_ACCOUNT_CLOSED");
    expect(alert_body()).toContain("Cancel I-SUB1 in the paypal dashboard.");
  });

  it("leaves the row cancelled and mails nobody while a retry is left", async () => {
    await seed_cancelled("I-SUB1", "paypal");
    paypal_refuses(429);

    await expect(
      handle_sub_deactivated(donor_cancelled("I-SUB1", "paypal"))
    ).rejects.toThrow();

    expect((await sub_get("I-SUB1"))?.status).toBe("inactive");
    expect(enqueue_mock).not.toHaveBeenCalled();
  });

  // a 5xx on the last attempt: the cancel may have landed after all
  it("leaves the row cancelled when stripe's last failed cancel landed", async () => {
    await seed_cancelled("sub_donor1", "stripe");
    stripe_retrieve_mock
      .mockResolvedValueOnce({ id: "sub_donor1", status: "active" })
      .mockResolvedValue({ id: "sub_donor1", status: "canceled" });
    stripe_cancel_mock.mockRejectedValue(
      new Stripe.errors.StripeAPIError({
        type: "api_error",
        statusCode: 500,
        message: "stripe is down",
      })
    );

    await handle_sub_deactivated(donor_cancelled("sub_donor1", "stripe"), {
      last: true,
    });

    expect((await sub_get("sub_donor1"))?.status).toBe("inactive");
    expect(enqueue_mock).not.toHaveBeenCalled();
    expect(alert_body()).toContain("isn't billing at stripe (canceled)");
    expect(alert_body()).not.toContain("dashboard");
  });

  it("leaves the row cancelled when paypal's last failed cancel landed", async () => {
    await seed_cancelled("I-SUB1", "paypal");
    paypal_refuses(429, "CANCELLED");

    await handle_sub_deactivated(donor_cancelled("I-SUB1", "paypal"), {
      last: true,
    });

    expect((await sub_get("I-SUB1"))?.status).toBe("inactive");
    expect(enqueue_mock).not.toHaveBeenCalled();
    expect(alert_body()).toContain("isn't billing at paypal (CANCELLED)");
    expect(alert_body()).not.toContain("dashboard");
  });

  it("tells ops a subscription paypal no longer has is already gone", async () => {
    await seed_cancelled("I-SUB1", "paypal");
    cancel_subscription_mock.mockRejectedValue(paypal_error(404));
    get_subscription_mock.mockRejectedValue(paypal_error(404));

    await handle_sub_deactivated(donor_cancelled("I-SUB1", "paypal"));

    expect((await sub_get("I-SUB1"))?.status).toBe("inactive");
    expect(enqueue_mock).not.toHaveBeenCalled();
    expect(alert_body()).toContain("isn't billing at paypal (not found)");
    expect(alert_body()).not.toContain("dashboard");
  });

  it("tells ops a subscription stripe no longer has is already gone", async () => {
    await seed_cancelled("sub_donor1", "stripe");
    stripe_retrieve_mock.mockRejectedValue(
      new Stripe.errors.StripeInvalidRequestError({
        type: "invalid_request_error",
        code: "resource_missing",
        statusCode: 404,
        message: "No such subscription: 'sub_donor1'",
      })
    );

    await handle_sub_deactivated(donor_cancelled("sub_donor1", "stripe"));

    expect((await sub_get("sub_donor1"))?.status).toBe("inactive");
    expect(enqueue_mock).not.toHaveBeenCalled();
    expect(alert_body()).toContain("isn't billing at stripe (not found)");
    expect(alert_body()).not.toContain("dashboard");
  });

  // an outage outlasting the retries: the cancel may have landed
  it("leaves the row cancelled when the live read fails too", async () => {
    await seed_cancelled("I-SUB1", "paypal");
    cancel_subscription_mock.mockRejectedValue(paypal_error(503));
    get_subscription_mock.mockRejectedValue(paypal_error(503));

    await handle_sub_deactivated(donor_cancelled("I-SUB1", "paypal"), {
      last: true,
    });

    expect((await sub_get("I-SUB1"))?.status).toBe("inactive");
    expect(enqueue_mock).not.toHaveBeenCalled();
    expect(alert_body()).toContain("Reading it live from paypal failed");
    expect(alert_body()).toContain("Cancel I-SUB1 in the paypal dashboard.");
  });

  it("queues the donor's email once when the refused cancel is delivered twice", async () => {
    await seed_cancelled("I-SUB1", "paypal");
    paypal_refuses();

    await handle_sub_deactivated(donor_cancelled("I-SUB1", "paypal"));
    await handle_sub_deactivated(donor_cancelled("I-SUB1", "paypal"));

    expect(queued_emails()).toHaveLength(1);
    expect(send_alert_mock).toHaveBeenCalledTimes(2);
    expect(alert_body(1)).toContain(
      "already active — the donor may not have been emailed by this delivery"
    );
  });

  // a refund landed between the donor's cancel and this delivery
  it("leaves a row whose cancel has changed since alone", async () => {
    await seed_cancelled("I-SUB1", "paypal", "refunded");
    paypal_refuses();

    await handle_sub_deactivated(donor_cancelled("I-SUB1", "paypal"));

    const row = await sub_get("I-SUB1");
    expect(row?.status).toBe("inactive");
    expect(row?.status_cancel_reason).toBe("refunded");
    expect(enqueue_mock).not.toHaveBeenCalled();
  });

  // the donor cancelled again with the same reason; the earlier cancel's job
  // is the one paypal refused
  it("leaves the row alone for a refused cancel older than the row's", async () => {
    await seed_cancelled("I-SUB1", "paypal");
    paypal_refuses();

    await handle_sub_deactivated({
      ...donor_cancelled("I-SUB1", "paypal"),
      updated_at: "2026-09-30T00:00:00.000Z",
    });

    const row = await sub_get("I-SUB1");
    expect(row?.status).toBe("inactive");
    expect(row?.status_cancel_reason).toBe(REASON);
    expect(enqueue_mock).not.toHaveBeenCalled();
    expect(alert_body()).toContain(
      "Its row has changed since the donor's cancel"
    );
  });

  it("still restores the row and tells ops when queueing the email fails", async () => {
    await seed_cancelled("I-SUB1", "paypal");
    paypal_refuses();
    enqueue_mock.mockRejectedValue(new Error("qstash is down"));

    await expect(
      handle_sub_deactivated(donor_cancelled("I-SUB1", "paypal"))
    ).resolves.toBeUndefined();

    expect((await sub_get("I-SUB1"))?.status).toBe("active");
    expect(send_alert_mock).toHaveBeenCalledOnce();
    expect(alert_body()).toContain("Its row was restored to active");
    expect(alert_body()).toContain("queueing the donor's email failed");
  });

  // a refund or a stripe-side end queues the same cancel; the donor asked for nothing
  it("leaves a cancel the donor didn't make alone", async () => {
    await seed_cancelled("sub_donor1", "stripe");
    stripe_refuses();

    await handle_sub_deactivated({
      id: "sub_donor1",
      platform: "stripe",
      status_cancel_reason: REASON,
    });

    expect((await sub_get("sub_donor1"))?.status).toBe("inactive");
    expect(enqueue_mock).not.toHaveBeenCalled();
    expect(send_alert_mock).toHaveBeenCalledOnce();
  });
});

describe("handle_sub_cancel_failed_email", () => {
  const payload = {
    id: "I-SUB1",
    cancelled_at: "2026-10-01T00:00:00.000Z",
    to: "ada@test.com",
    to_name: "Save The Rainforest",
    amount: 25,
    amount_usd: 25,
    currency: "usd",
    interval: "month" as const,
    interval_count: 1,
  };

  it("tells the donor their cancel didn't go through", async () => {
    await handle_sub_cancel_failed_email(payload);

    expect(send_email_mock).toHaveBeenCalledOnce();
    const mail = send_email_mock.mock.calls[0]![0];
    expect(mail.to).toEqual(["ada@test.com"]);
    const { render } = await import("react-email");
    const text = await render(mail.node, { plainText: true });
    expect(text).toContain("http://localhost:4200/dashboard/subscriptions");
    expect(text).toContain("25.00 USD");
    expect(text).toContain("Save The Rainforest");
    // the refusal was final: ops stops it, the donor is not sent to retry
    expect(text).toContain("Our team has been told and will stop it");
    expect(text).not.toMatch(/try cancelling/i);
  });

  it("throws when the send fails, so the queue retries it", async () => {
    send_email_mock.mockRejectedValue(new Error("550 mailbox unavailable"));

    await expect(handle_sub_cancel_failed_email(payload)).rejects.toThrow(
      "550"
    );
  });
});
