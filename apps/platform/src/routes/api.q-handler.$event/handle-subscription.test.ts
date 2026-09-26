import { beforeEach, describe, expect, it, vi } from "vitest";

const cancel_subscription_mock = vi.hoisted(() => vi.fn());
const stripe_retrieve_mock = vi.hoisted(() => vi.fn());
const stripe_cancel_mock = vi.hoisted(() => vi.fn());

vi.mock("$/kit/paypal", () => ({
  paypal: { cancel_subscription: cancel_subscription_mock },
}));
vi.mock("$/kit/stripe", () => ({
  stripe: {
    subscriptions: {
      retrieve: stripe_retrieve_mock,
      cancel: stripe_cancel_mock,
    },
  },
}));

const { handle_sub_deactivated } = await import("./handle-subscription");

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

  it("resolves on a subscription stripe already canceled", async () => {
    stripe_with("canceled");

    await expect(deactivate()).resolves.toBeUndefined();
    expect(stripe_cancel_mock).not.toHaveBeenCalled();
  });
});
