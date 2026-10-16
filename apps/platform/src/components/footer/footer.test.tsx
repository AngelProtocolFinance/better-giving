import { type ActionFunctionArgs, createRoutesStub } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
// the reflow case measures layout, which needs the real stylesheet
import "#/index.css";
import { Footer } from "./footer";

const stb = (variant: "full" | "minimal") =>
  createRoutesStub([
    {
      path: "/",
      Component: () => <Footer variant={variant} />,
      HydrateFallback: () => null,
    },
  ]);

describe("footer donate link", () => {
  test("full variant links to the Better Giving donate page", async () => {
    const Stub = stb("full");
    const screen = await render(<Stub />);

    const link = screen.getByRole("link", { name: /^donate$/i });
    await expect.element(link).toBeVisible();
    await expect.element(link).toHaveAttribute("href", "/donate/1");
  });

  test("minimal variant has no donate link", async () => {
    const Stub = stb("minimal");
    const screen = await render(<Stub />);

    // sanity: the minimal footer did render
    await expect
      .element(screen.getByRole("link", { name: /privacy policy/i }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: /^donate$/i }))
      .not.toBeInTheDocument();
  });
});

// the root action's two answers, without hubspot: getValidatedFormData's shape
// for a refused address, and the success literal
async function subscribe_action({ request }: ActionFunctionArgs) {
  const email = String((await request.formData()).get("email") ?? "");
  if (!email.includes("@")) {
    return {
      errors: { email: { type: "email", message: "invalid email" } },
      receivedValues: { email },
    };
  }
  return "success";
}

const newsletter_stub = () =>
  createRoutesStub([
    {
      path: "/",
      Component: () => <Footer />,
      action: subscribe_action,
      HydrateFallback: () => null,
    },
  ]);

afterEach(async () => {
  await page.viewport(414, 896);
});

describe("footer newsletter", () => {
  test("a refused address is marked on the field and described; a good one is announced", async () => {
    const Stub = newsletter_stub();
    const screen = await render(<Stub />);

    // a visible label names the field
    const email = screen.getByLabelText("Email address");
    await expect.element(email).toBeVisible();
    await expect.element(email).not.toHaveAttribute("aria-invalid");

    await email.fill("not-an-address");
    await screen.getByRole("button", { name: "Subscribe" }).click();

    await expect.element(email).toHaveAttribute("aria-invalid", "true");
    await expect.element(email).toHaveFocus();
    const described_by = email.element().getAttribute("aria-describedby");
    expect(described_by).toBeTruthy();
    const description = document.getElementById(described_by as string);
    expect(description?.textContent).toContain("invalid email");
    // the error lands in the same polite region the success line does
    expect(description?.closest('[role="status"]')).not.toBeNull();

    await email.fill("ops@nonprofit.org");
    await screen.getByRole("button", { name: "Subscribe" }).click();

    await expect
      .element(screen.getByRole("status"))
      .toMatchTextContent(/sent successfully/i);
    await expect.element(email).not.toHaveAttribute("aria-invalid");
    await expect.element(email).not.toHaveAttribute("aria-describedby");
  });

  test.each([320, 375, 640])(
    "reflows into a %ipx viewport without widening the page",
    async (w) => {
      await page.viewport(w, 800);
      const Stub = stb("full");
      const screen = await render(<Stub />);
      await expect
        .element(screen.getByRole("button", { name: "Subscribe" }))
        .toBeVisible();

      const footer = screen.getByRole("contentinfo").element();
      expect(footer.scrollWidth).toBeLessThanOrEqual(footer.clientWidth);
      expect(document.documentElement.scrollWidth).toBe(window.innerWidth);
    }
  );
});
