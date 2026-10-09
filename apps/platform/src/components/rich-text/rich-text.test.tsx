import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { to_content } from "./helpers";
import { RichText } from "./rich-text";

const block = (
  key: string,
  text: string,
  marks: string[],
  markDefs: object[] = []
) => ({
  _type: "block",
  _key: key,
  style: "normal",
  markDefs,
  children: [{ _type: "span", _key: `${key}s`, text, marks }],
});

describe("read-only rich text", () => {
  test("renders the text of a mark or annotation named after an Object.prototype key", async () => {
    const json = JSON.stringify([
      block("b1", "Decorated text", ["constructor"]),
      block(
        "b2",
        "Annotated text",
        ["k1"],
        [{ _key: "k1", _type: "toString" }]
      ),
      block("b3", "After the odd marks", []),
    ]);
    const screen = await render(
      <RichText readOnly content={to_content(json)} />
    );
    await expect.element(screen.getByText("Decorated text")).toBeVisible();
    await expect.element(screen.getByText("Annotated text")).toBeVisible();
    await expect.element(screen.getByText("After the odd marks")).toBeVisible();
  });
});
