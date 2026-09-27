import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { currency } from "./currency";
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

  test("a currency's figures carry its own decimal places", () => {
    const total = (code: string, rate: number, amount: number) => {
      const html = renderToStaticMarkup(
        createElement(Summary, {
          Amount: currency({ code, rate, min: 1 }),
          on_back: () => {},
          amount,
        })
      );
      return html.match(/<dd[^>]*>([^<]*)<\/dd>/g)?.at(-1);
    };
    expect(total("JPY", 150, 1500)).toMatch(/>JPY 1,500 \(\$10\.00\)</);
    expect(total("ISK", 150, 1500)).toMatch(/>ISK 1,500 \(\$10\.00\)</);
    expect(total("USD", 1, 12.3)).toMatch(/>\$12\.30</);
  });
});
