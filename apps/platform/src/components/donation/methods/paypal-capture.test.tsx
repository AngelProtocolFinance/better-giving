import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { donor_fv_blank } from "@/donations/schema";
import { Context } from "../context";
import { type Config, donation_recipient_init, type TDonation } from "../types";
import { stb } from "./__tests__/test-data";
import { Paypal } from "./paypal";

// a session that approves the moment it starts, so the click runs the whole
// intent → approve → capture round trip. own file: paypal.tsx caches the sdk at
// module scope, and vitest gives each file its own module registry.
vi.mock("@paypal/paypal-js/sdk-v6", () => {
  const approving_session = ({
    onApprove,
  }: {
    onApprove: (d: { orderId: string }) => Promise<void>;
  }) => ({
    start: async (_: unknown, order: Promise<{ orderId: string }>) => {
      const { orderId } = await order;
      await onApprove({ orderId });
    },
  });
  return {
    loadCoreSdkScript: async () => ({
      createInstance: async () => ({
        findEligibleMethods: async () => ({
          isEligible: (m: string) => m === "paypal" || m === "venmo",
        }),
        createPayPalOneTimePaymentSession: approving_session,
        createVenmoOneTimePaymentSession: approving_session,
      }),
    }),
  };
});

const report_error = vi.hoisted(() => vi.fn());
vi.mock("#/errors/report", async (orig) => ({
  ...(await orig<typeof import("#/errors/report")>()),
  report_error,
}));

// the thank-you trip would navigate the test runner's own page away
const redirect = vi.hoisted(() => vi.fn());
vi.mock("../common/redirect", async (orig) => ({
  ...(await orig<typeof import("../common/redirect")>()),
  use_donation_redirect: () => redirect,
}));

const init = (config: Config | null): TDonation => ({
  base_url: "https://better.giving",
  source: "bg-marketplace",
  mode: "live",
  recipient: donation_recipient_init({ hide_bg_tip: true }),
  donor: donor_fv_blank,
  config,
  method: "stripe",
  hide_unavailable_express: true,
});

const express = {
  currency: "USD",
  frequency: "one-time" as const,
  amnt: 25,
  tip: 0,
  fee_allowance: 0,
  is_partial: false,
};

/** paypal's Orders v2 capture response, trimmed to what the browser reads */
const captured = (status: string, source: "paypal" | "venmo" = "paypal") => ({
  id: "order_1",
  status:
    status === "COMPLETED" || status === "PENDING" ? "COMPLETED" : "APPROVED",
  payment_source: {
    [source]: { name: { given_name: "Jane", surname: "Roe" } },
  },
  purchase_units: [
    {
      custom_id: "don_1",
      payments: { captures: [{ id: "cap_1", status }] },
    },
  ],
});

const approve_and_capture = async (
  capture_body: unknown,
  config: Config | null = null,
  button: "paypal-button" | "venmo-button" = "paypal-button"
) => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_, init) =>
    init?.method === "PATCH"
      ? Response.json(capture_body)
      : Response.json({ tx_id: "order_1", don_id: "don_1" })
  );
  const on_error = vi.fn();
  const on_paid = vi.fn();
  const on_unconfirmed = vi.fn();
  const Stub = stb(
    <Context {...init(config)}>
      <Paypal
        {...express}
        validate={async () => true}
        on_error={on_error}
        on_paid={on_paid}
        on_unconfirmed={on_unconfirmed}
      />
    </Context>
  );
  const screen = await render(<Stub />);
  const btn = await vi.waitFor(() => {
    const el = screen.container.querySelector(button);
    expect(el).not.toBeNull();
    return el as HTMLElement;
  });
  btn.click();
  return { on_error, on_paid, on_unconfirmed };
};

afterEach(() => {
  vi.restoreAllMocks();
  redirect.mockReset();
  report_error.mockClear();
});

describe("paypal express: a capture paypal did not complete", () => {
  test.each(["DECLINED", "FAILED"])(
    "%s is shown as a failure and never reaches the thank-you page",
    async (status) => {
      const { on_error, on_paid } = await approve_and_capture(captured(status));

      await vi.waitFor(() => expect(on_error).toHaveBeenCalledOnce());
      expect(on_error).toHaveBeenCalledWith(
        "PayPal declined the payment — please try again or use another payment method."
      );
      expect(on_paid).not.toHaveBeenCalled();
      expect(redirect).not.toHaveBeenCalled();
    }
  );
});

describe("venmo express: a capture venmo did not complete", () => {
  test("names venmo as the one that declined", async () => {
    const { on_error, on_paid } = await approve_and_capture(
      captured("DECLINED", "venmo"),
      null,
      "venmo-button"
    );

    await vi.waitFor(() => expect(on_error).toHaveBeenCalledOnce());
    expect(on_error).toHaveBeenCalledWith(
      "Venmo declined the payment — please try again or use another payment method."
    );
    expect(on_paid).not.toHaveBeenCalled();
  });
});

describe("paypal express: a capture with no status paypal reported", () => {
  test("asks the donor not to pay again, and tells the form", async () => {
    const body = captured("COMPLETED");
    delete (body.purchase_units[0]!.payments.captures[0] as { status?: string })
      .status;
    const { on_error, on_paid, on_unconfirmed } =
      await approve_and_capture(body);

    await vi.waitFor(() => expect(on_error).toHaveBeenCalledOnce());
    expect(on_error).toHaveBeenCalledWith(
      "We couldn't confirm your payment yet. Please don't pay again — check your email for a receipt from PayPal, or contact us."
    );
    expect(on_paid).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    expect(on_unconfirmed).toHaveBeenCalledOnce();
    // the server already reported it
    expect(report_error).not.toHaveBeenCalled();
  });
});

describe("venmo express: a capture with no status", () => {
  test("names venmo as the one to expect a receipt from", async () => {
    const body = captured("COMPLETED", "venmo");
    delete (body.purchase_units[0]!.payments.captures[0] as { status?: string })
      .status;
    const { on_error } = await approve_and_capture(body, null, "venmo-button");

    await vi.waitFor(() => expect(on_error).toHaveBeenCalledOnce());
    expect(on_error).toHaveBeenCalledWith(
      "We couldn't confirm your payment yet. Please don't pay again — check your email for a receipt from Venmo, or contact us."
    );
  });
});

describe("paypal express: a capture paypal took", () => {
  test.each(["COMPLETED", "PENDING"])(
    "%s goes on to the thank-you page for the captured donation",
    async (status) => {
      const { on_error, on_paid } = await approve_and_capture(captured(status));

      await vi.waitFor(() => expect(on_paid).toHaveBeenCalledOnce());
      const dest = {
        url: "https://better.giving/donations/don_1",
        is_custom: false,
      };
      expect(on_paid).toHaveBeenCalledWith(dest);
      expect(redirect).toHaveBeenCalledWith(expect.objectContaining({ dest }));
      expect(on_error).not.toHaveBeenCalled();
    }
  );
});

describe("paypal express: a merchant's own thank-you page", () => {
  test("is handed the payer's name paypal returned", async () => {
    const config: Config = {
      id: "form_1",
      success_redirect: "https://npo.example/thanks",
      freq_opts: undefined,
    };
    const { on_paid } = await approve_and_capture(
      captured("COMPLETED"),
      config
    );

    await vi.waitFor(() => expect(on_paid).toHaveBeenCalledOnce());
    const { url } = on_paid.mock.calls[0]![0];
    expect(new URL(url).searchParams.get("donor_name")).toBe("Jane Roe");
  });
});
