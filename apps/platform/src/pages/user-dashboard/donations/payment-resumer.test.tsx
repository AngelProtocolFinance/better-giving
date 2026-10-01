import { AskHost } from "@better-giving/ui";
import { HttpResponse, http } from "msw";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { mswWorker } from "#/setup-tests-browser";
import type { Payment } from "#/types/crypto";
import { PaymentResumer } from "./payment-resumer";

const payment: Payment = {
  id: 5501,
  order_id: "0b9f6a52-3c1e-4d8a-9f1e-2a7c5d4e6f80",
  address: "bc1qresumeaddressxyz",
  // base + tip + fee allowance, as nowpayments expects it, above the row's base amount
  amount: 0.0123,
  usdpu: 60_000,
  currency: "BTC",
  description: "Clean Water Fund",
};

describe("PaymentResumer", () => {
  test("donor resuming a crypto payment is told to send the payment's amount, not the row's base amount", async () => {
    mswWorker.use(
      http.get("/api/crypto-intents/:id", () => HttpResponse.json(payment))
    );
    const screen = await render(
      <>
        <PaymentResumer payment_id={payment.id} />
        <AskHost />
      </>
    );

    await screen.getByRole("button", { name: /finish paying/i }).click();

    await expect
      .element(screen.getByRole("dialog"))
      .toMatchTextContent(/send 0\.01230*\s*BTC/);
  });
});
