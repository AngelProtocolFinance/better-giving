import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { base_url } from "#/constants/env";
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

describe("footer legal links", () => {
  test.each(["full", "minimal"] as const)(
    "%s variant links donor terms and nonprofit terms",
    async (variant) => {
      const Stub = stb(variant);
      const screen = await render(<Stub />);

      const donor = screen.getByRole("link", { name: /^donor terms$/i });
      await expect.element(donor).toBeVisible();
      await expect.element(donor).toHaveAttribute("href", "/terms-of-use");

      const nonprofit = screen.getByRole("link", {
        name: /^nonprofit terms$/i,
      });
      await expect.element(nonprofit).toBeVisible();
      await expect
        .element(nonprofit)
        .toHaveAttribute("href", `${base_url}/terms-of-use-npo/`);
    }
  );
});
