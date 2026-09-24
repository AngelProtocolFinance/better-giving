import { describe, expect, it, vi } from "vitest";
import { to_fn } from "./donation-recipient";

const fund_get_mock = vi.hoisted(() => vi.fn());

vi.mock("$/pg/queries/fund", () => ({ fund_get: fund_get_mock }));
vi.mock("$/pg/queries/npo", () => ({ npo_get: vi.fn() }));

describe("to_fn", () => {
  // api.donation-notifications resolves a recipient for a donation already made
  it("resolves a closed fund when no open_at is given", async () => {
    const fund_id = "4f3b2a10-9c8d-4e7f-a6b5-c4d3e2f1a0b9";
    fund_get_mock.mockResolvedValueOnce({
      id: fund_id,
      name: "Relief Fund",
      hide_bg_tip: false,
      members: [7, 9],
      active: false,
      expiration: "2020-01-01T00:00:00.000Z",
    });

    await expect(to_fn(fund_id)).resolves.toEqual({
      to_id: fund_id,
      to_type: "fund",
      to_name: "Relief Fund",
      to_tip_allowed: true,
      to_members: ["7", "9"],
    });
  });
});
