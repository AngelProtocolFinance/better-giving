import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { type IOwedTable, OwedTable } from "./owed-table";
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

  test("loading more holds its button; an empty list says so and offers no more", async () => {
    const screen = await render(
      <OwedTable {...props({ loading_more: true })} />
    );
    await expect
      .element(screen.getByRole("button", { name: "Loading..." }))
      .toBeDisabled();

    screen.rerender(<OwedTable {...props({ rows: [], has_more: false })} />);
    await expect
      .element(screen.getByText("No amounts owed found"))
      .toBeVisible();
    expect(
      screen.getByRole("button", { name: "View More" }).query()
    ).toBeNull();
  });
});
