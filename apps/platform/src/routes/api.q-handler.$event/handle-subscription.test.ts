import { beforeEach, describe, expect, it, vi } from "vitest";

const cancel_subscription_mock = vi.hoisted(() => vi.fn());

vi.mock("$/kit/paypal", () => ({
  paypal: { cancel_subscription: cancel_subscription_mock },
}));
vi.mock("$/kit/stripe", () => ({ stripe: {} }));

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

  it("caps a 200-character reason at paypal's 128", async () => {
    const reason = await cancel_on_paypal("x".repeat(200));
    expect(reason).toBe("x".repeat(128));
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

  it("never splits an emoji at the cut", async () => {
    const reason = await cancel_on_paypal(`${"a".repeat(127)}😀`);
    expect(reason).toBe("a".repeat(127));
  });
});
