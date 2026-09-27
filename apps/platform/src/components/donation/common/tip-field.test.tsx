import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { TipField } from "./tip-field";

vi.mock("../context", () => ({
  use_donation: vi.fn().mockReturnValue({
    don: { base_url: "https://test.example.com" },
    don_set: vi.fn(),
  }),
}));

describe("tip field", () => {
  test("the icon-only custom option is named, and picking it asks for a custom tip", async () => {
    const tip_format_changed = vi.fn();
    const screen = await render(
      <TipField
        checked
        checked_changed={() => {}}
        tip_format="10"
        tip_format_changed={tip_format_changed}
        custom_tip={undefined}
        nudge={false}
      />
    );

    const custom = screen.getByRole("radio", {
      name: "Custom amount",
      exact: true,
    });
    await expect.element(custom).not.toBeChecked();
    await custom.click({ force: true });
    expect(tip_format_changed).toHaveBeenCalledWith("custom");
  });
});
