import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { Summary } from "./summary";
import { token } from "./token";

describe("Summary", () => {
  test("a token total keeps the token formatter's own rounding", () => {
    // 0.001 + 0.0002 is 0.0012000000000000001, which rounds away from zero
    // to the next display unit at 6 decimals
    const html = renderToStaticMarkup(
      createElement(Summary, {
        Amount: token(10_000, 8),
        on_back: () => {},
        amount: 0.001,
        tip: { value: 0.0002, charity_name: "npo" },
      })
    );
    const dds = html.match(/<dd[^>]*>[^<]*<\/dd>/g) ?? [];
    expect(dds.at(-1)).toMatch(/>0\.001201 /);
  });
});
