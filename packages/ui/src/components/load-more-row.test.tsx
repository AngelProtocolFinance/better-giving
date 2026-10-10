import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { LoadMoreRow } from "./load-more-row";

interface ITable {
  loading?: boolean;
  disabled?: boolean;
  on_load_next(): void;
}

function Table(p: ITable) {
  return (
    <table className="table">
      <tbody>
        <tr>
          <td>Row one</td>
        </tr>
      </tbody>
      <LoadMoreRow col_span={1} {...p} />
    </table>
  );
}

// native clicks on the held button: playwright's actionability check waits
// out aria-disabled instead of pressing it
const press = (el: Element) => (el as HTMLElement).click();

describe("LoadMoreRow", () => {
  test("pressed, it holds while loading and keeps focus through the next page landing", async () => {
    const on_load_next = vi.fn();
    const screen = await render(<Table on_load_next={on_load_next} />);
    const more = screen.getByRole("button", { name: "View More" });
    await expect.element(more).toHaveAttribute("aria-disabled", "false");
    await more.click();
    expect(on_load_next).toHaveBeenCalledOnce();
    await expect.element(more).toHaveFocus();

    await screen.rerender(<Table loading on_load_next={on_load_next} />);
    const loading = screen.getByRole("button", { name: "Loading..." });
    await expect.element(loading).toHaveAttribute("aria-disabled", "true");
    await expect.element(loading).toHaveAttribute("aria-busy", "true");
    await expect.element(loading).toHaveFocus();
    press(loading.element());
    expect(on_load_next).toHaveBeenCalledOnce();

    await screen.rerender(<Table on_load_next={on_load_next} />);
    await expect.element(more).toHaveAttribute("aria-busy", "false");
    await expect.element(more).toHaveFocus();
  });

  test("disabled without loading holds the press but isn't busy", async () => {
    const on_load_next = vi.fn();
    const screen = await render(<Table disabled on_load_next={on_load_next} />);
    const more = screen.getByRole("button", { name: "View More" });
    await expect.element(more).toHaveAttribute("aria-disabled", "true");
    await expect.element(more).toHaveAttribute("aria-busy", "false");
    press(more.element());
    expect(on_load_next).not.toHaveBeenCalled();
  });
});
