import { describe, expect, it } from "vitest";
import { signup_url } from "#/helpers/login-url";
import { retry_form_action } from "./oauth-error";

describe("after a failed google sign-in", () => {
  it("posts the retry without the provider's error or its description", () => {
    const params = new URLSearchParams({
      redirect: "/dashboard",
      error: "access_denied",
      error_description: "The user denied access",
    });

    expect(retry_form_action(params)).toBe("/login?redirect=%2Fdashboard");
  });

  it("leaves the form's own action alone when there was no error", () => {
    expect(retry_form_action(new URLSearchParams("redirect=/x"))).toBe(
      undefined
    );
  });

  it("links to signup carrying the encoded return path", () => {
    expect(signup_url("/donate/1?a=b&c=d")).toBe(
      "/signup?redirect=%2Fdonate%2F1%3Fa%3Db%26c%3Dd"
    );
  });
});
