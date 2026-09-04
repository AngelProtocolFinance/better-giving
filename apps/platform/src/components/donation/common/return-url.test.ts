import { describe, expect, test } from "vitest";
import { donation_return_url } from "./return-url";

const base = {
  donation_id: "don_1",
  base_url: "https://better.giving",
  amount: 125,
  currency: "USD",
  payment_method: "card",
};

describe("where a completed donation lands", () => {
  test("our own receipt carries no params — it reads the donation row", () => {
    const dest = donation_return_url(base);

    expect(dest).toEqual({
      url: "https://better.giving/donations/don_1",
      is_custom: false,
    });
  });

  test("a merchant's success_redirect carries the donation's details", () => {
    const dest = donation_return_url({
      ...base,
      success_redirect: "https://npo.org/thanks",
      payment_method: "google_pay",
      donor_name: ["John", "Doe"],
    });

    expect(dest.is_custom).toBe(true);
    const u = new URL(dest.url);
    expect(u.origin + u.pathname).toBe("https://npo.org/thanks");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      donation_amount: "125",
      donation_currency: "USD",
      payment_method: "google_pay",
      donor_name: "John Doe",
    });
  });

  test("a name we don't have is left out, never guessed at", () => {
    // a wallet mononym would reach the merchant's page as "John undefined",
    // and a donor who gave no name as the literal "Anonymous". both render
    // straight into someone's "Thank you, ___".
    const mononym = donation_return_url({
      ...base,
      success_redirect: "https://npo.org/thanks",
      donor_name: ["John", undefined],
    });
    expect(new URL(mononym.url).searchParams.get("donor_name")).toBe("John");

    const nameless = donation_return_url({
      ...base,
      success_redirect: "https://npo.org/thanks",
      donor_name: ["", "  "],
    });
    expect(new URL(nameless.url).searchParams.has("donor_name")).toBe(false);
  });
});
