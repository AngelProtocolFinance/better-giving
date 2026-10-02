import { describe, expect, it, vi } from "vitest";
import { get_funds, get_funds_npo_memberof } from "./funds";

const fund_search_mock = vi.hoisted(() => vi.fn());
const fund_npo_memberof_mock = vi.hoisted(() => vi.fn());
const report_error_mock = vi.hoisted(() => vi.fn());

vi.mock("$/pg/queries/fund", () => ({
  fund_search: fund_search_mock,
  fund_npo_memberof: fund_npo_memberof_mock,
}));
vi.mock("#/errors/report", () => ({ report_error: report_error_mock }));

// the shape neon's http driver throws when the fetch never reaches the server
const unreachable = () =>
  new Error("Error connecting to database: TypeError: fetch failed");

describe("funds reads when the database is unreachable", () => {
  // a loader throw is reported by entry.server's handleError; reporting here too would double it
  it("get_funds rejects instead of answering an empty page", async () => {
    const err = unreachable();
    fund_search_mock.mockRejectedValueOnce(err);

    await expect(get_funds({ page: 1 })).rejects.toBe(err);
    expect(report_error_mock).not.toHaveBeenCalled();
  });

  it("get_funds_npo_memberof rejects instead of answering no fundraisers", async () => {
    const err = unreachable();
    fund_npo_memberof_mock.mockRejectedValueOnce(err);

    await expect(get_funds_npo_memberof(87, { published: true })).rejects.toBe(
      err
    );
    expect(report_error_mock).not.toHaveBeenCalled();
  });
});
