import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { type IOwedTable, OwedTable, owed_return_target } from "./owed-table";
import { owed_row } from "./test-row";

const referrer_row = owed_row({
  id: "owed-2",
  donation_id: "don-2",
  npo_id: null,
  referrer_user: "REF42",
  party: "referrer",
  party_name: null,
  source: "dispute",
  source_ref: "dp_9",
  outstanding_usd: 12.5,
});

const props = (o: Partial<IOwedTable> = {}): IOwedTable => ({
  rows: [owed_row(), referrer_row],
  party: "all",
  sort: "date",
  dir: "desc",
  on_party_change: vi.fn(),
  on_sort_change: vi.fn(),
  has_more: true,
  loading_more: false,
  on_load_more: vi.fn(),
  on_write_off: vi.fn(),
  on_credit: vi.fn(),
  ...o,
});

describe("owed table", () => {
  test("lists both parties; filter, sort, load more and row actions call back with their args", async () => {
    const p = props();
    const screen = await render(<OwedTable {...p} />);

    // a referrer with no name on file reads as its referral code
    await expect.element(screen.getByText("River Trust")).toBeVisible();
    await expect.element(screen.getByText("REF42")).toBeVisible();
    await expect
      .element(screen.getByText("Nonprofit", { exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByText("Referrer", { exact: true }))
      .toBeVisible();
    await expect.element(screen.getByText("53.20")).toBeVisible();
    await expect.element(screen.getByText("dp_9")).toBeVisible();

    await screen.getByRole("combobox", { name: "Party" }).click();
    await screen.getByRole("option", { name: "Referrers" }).click();
    expect(p.on_party_change).toHaveBeenCalledWith("referrer");

    const recorded = screen.getByRole("columnheader", { name: "Recorded" });
    await expect.element(recorded).toHaveAttribute("aria-sort", "descending");
    await screen.getByRole("button", { name: "Recorded" }).click();
    expect(p.on_sort_change).toHaveBeenLastCalledWith("date", "asc");
    await screen.getByRole("button", { name: "Outstanding" }).click();
    expect(p.on_sort_change).toHaveBeenLastCalledWith("outstanding", "desc");

    await screen.getByRole("button", { name: "View More" }).click();
    expect(p.on_load_more).toHaveBeenCalledOnce();

    await screen.getByRole("button", { name: "Write off REF42" }).click();
    expect(p.on_write_off).toHaveBeenCalledWith("owed-2");
    await screen.getByRole("button", { name: "Credit River Trust" }).click();
    expect(p.on_credit).toHaveBeenCalledWith("owed-1");
  });

  test("a sorted ascending column flips back to descending", async () => {
    const p = props({ sort: "outstanding", dir: "asc" });
    const screen = await render(<OwedTable {...p} />);
    await expect
      .element(screen.getByRole("columnheader", { name: "Outstanding" }))
      .toHaveAttribute("aria-sort", "ascending");
    await screen.getByRole("button", { name: "Outstanding" }).click();
    expect(p.on_sort_change).toHaveBeenCalledWith("outstanding", "desc");
  });

  test("a gone row action's return target: the same row, the next, the nearest above, then the empty state", async () => {
    const screen = await render(<OwedTable {...props()} />);
    const at = (row_id: string, index: number) =>
      owed_return_target({ row_id, action: "write_off", index });

    // still listed, wherever it moved to
    expect(at("owed-2", 0)).toBe(
      screen.getByRole("button", { name: "Write off REF42" }).element()
    );
    // gone from the top: the row that slid into its place
    expect(at("owed-0", 0)).toBe(
      screen.getByRole("button", { name: "Write off River Trust" }).element()
    );
    // gone from the bottom, or past what a reload kept: the last row left
    for (const index of [2, 7]) {
      expect(at("owed-0", index)).toBe(
        screen.getByRole("button", { name: "Write off REF42" }).element()
      );
    }
    expect(
      owed_return_target({ row_id: "owed-3", action: "credit", index: 1 })
    ).toBe(screen.getByRole("button", { name: "Credit REF42" }).element());

    await screen.rerender(<OwedTable {...props({ rows: [] })} />);
    expect(at("owed-1", 0)).toBe(
      screen.getByText("No amounts owed found").element().closest("td")
    );
  });

  test("each sort button is a 24px target held inside its header cell", async () => {
    const screen = await render(<OwedTable {...props()} />);
    for (const name of ["Outstanding", "Recorded"]) {
      const button = screen.getByRole("button", { name }).element();
      const cell = screen.getByRole("columnheader", { name }).element();
      const b = button.getBoundingClientRect();
      const c = cell.getBoundingClientRect();
      expect(b.height).toBeGreaterThanOrEqual(24);
      expect(b.width).toBeGreaterThanOrEqual(24);
      expect(b.top).toBeGreaterThanOrEqual(c.top);
      expect(b.bottom).toBeLessThanOrEqual(c.bottom);
      // the overhang sits in the cell's padding: in flow the button takes no
      // more than the header's own line, so the row keeps its height
      const s = getComputedStyle(button);
      const in_flow =
        b.height +
        Number.parseFloat(s.marginTop) +
        Number.parseFloat(s.marginBottom);
      expect(in_flow).toBeLessThanOrEqual(
        Number.parseFloat(getComputedStyle(cell).lineHeight)
      );
    }
  });

  test("loading more holds its button; an empty list says so and offers no more", async () => {
    const screen = await render(
      <OwedTable {...props({ loading_more: true })} />
    );
    // held, not disabled, so focus stays on it
    await expect
      .element(screen.getByRole("button", { name: "Loading..." }))
      .toHaveAttribute("aria-disabled", "true");

    screen.rerender(<OwedTable {...props({ rows: [], has_more: false })} />);
    await expect
      .element(screen.getByText("No amounts owed found"))
      .toBeVisible();
    expect(
      screen.getByRole("button", { name: "View More" }).query()
    ).toBeNull();
  });
});
