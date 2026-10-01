import { PortableText } from "@portabletext/react";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { pt_components } from "./pt-components";

const linked = (text: string, href: unknown) => ({
  _type: "block",
  _key: text,
  style: "normal",
  markDefs: [{ _key: "l1", _type: "link", href }],
  children: [{ _type: "span", _key: "s1", text, marks: ["l1"] }],
});

describe("rich text links", () => {
  test("a stored http link renders as a link; a javascript:, data: or vbscript: one renders as plain text", async () => {
    const screen = await render(
      <PortableText
        value={[
          linked("Our site", "https://example.org"),
          linked("Js link", "javascript:alert(1)"),
          linked("Data link", "data:text/html,<script>alert(1)</script>"),
          linked("Vb link", "vbscript:msgbox(1)"),
        ]}
        components={pt_components}
      />
    );
    await expect
      .element(screen.getByRole("link", { name: "Our site" }))
      .toHaveAttribute("href", "https://example.org");
    await expect.element(screen.getByText("Js link")).toBeVisible();
    await expect.element(screen.getByText("Data link")).toBeVisible();
    await expect.element(screen.getByText("Vb link")).toBeVisible();
    expect(screen.container.querySelectorAll("a").length).toBe(1);
  });

  test("only a full http(s) url is a link: a bare domain, a relative path, a protocol-relative url or a non-string href renders as plain text", async () => {
    const screen = await render(
      <PortableText
        value={[
          linked("Full", "https://example.org/about"),
          linked("Plain http", "http://example.org"),
          linked("Bare domain", "www.example.org"),
          linked("Path", "/donate"),
          linked("Protocol relative", "//example.org"),
          linked("Mail", "mailto:hi@example.org"),
          linked("Number", 42),
        ]}
        components={pt_components}
      />
    );
    await expect
      .element(screen.getByRole("link", { name: "Full" }))
      .toHaveAttribute("href", "https://example.org/about");
    await expect
      .element(screen.getByRole("link", { name: "Plain http" }))
      .toHaveAttribute("href", "http://example.org");
    for (const t of [
      "Bare domain",
      "Path",
      "Protocol relative",
      "Mail",
      "Number",
    ]) {
      await expect.element(screen.getByText(t)).toBeVisible();
    }
    expect(screen.container.querySelectorAll("a").length).toBe(2);
  });
});
