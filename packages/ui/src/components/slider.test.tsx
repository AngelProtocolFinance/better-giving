import { describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Slider } from "./slider";

describe("Slider", () => {
  test("takes its accessible name from label, drawn or hidden", async () => {
    const screen = await render(
      <>
        <Slider
          label="Years"
          value={5}
          min={5}
          max={20}
          step={5}
          onValueChange={() => {}}
        />
        <Slider
          label="Processing fee"
          hideLabel
          value={0.02}
          min={0}
          max={0.1}
          step={0.001}
          onValueChange={() => {}}
        />
      </>
    );
    await expect
      .element(screen.getByRole("slider", { name: "Years" }))
      .toBeInTheDocument();
    await expect
      .element(screen.getByRole("slider", { name: "Processing fee" }))
      .toBeInTheDocument();
  });

  test("arrow keys report the next value", async () => {
    const seen: number[] = [];
    const screen = await render(
      <Slider
        label="Years"
        value={10}
        min={5}
        max={20}
        step={5}
        onValueChange={(n) => seen.push(n)}
      />
    );
    (
      screen.getByRole("slider", { name: "Years" }).element() as HTMLElement
    ).focus();

    await userEvent.keyboard("{ArrowRight}");
    await userEvent.keyboard("{ArrowLeft}");
    expect(seen).toEqual([15, 5]);
  });
});
