import { PortableText } from "@portabletext/react";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { pt_components } from "./pt-components";

const linked = (text: string, href: string) => ({
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
});
