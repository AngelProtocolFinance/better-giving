import { HandshakeIcon, MegaphoneIcon } from "lucide-react";
import { describe, expect, it } from "vitest";
import { routes } from "#/pages/admin/routes";
import { linkGroups } from "./constants";

function link(title: string) {
  return linkGroups
    .flatMap((group) => group.links)
    .find((item) => item.title === title);
}

describe("admin sidebar", () => {
  it("keeps Campaigns clickable under a campaign route and leaves the other ends", () => {
    const titles = linkGroups
      .flatMap((group) => group.links)
      .filter((item) => item.end)
      .map((item) => item.title);
    // membership, not sidebar order — a reorder is not an exact-match change
    expect(new Set(titles)).toEqual(new Set(["Dashboard", "Campaigns"]));
    expect(link("Campaigns")?.icon.fn).toBe(MegaphoneIcon);
  });

  it("renames opt-outs and marks referrals with a handshake", () => {
    expect(link("Fundraiser opt-outs")?.to).toBe(routes.funds);
    expect(link("Campaign opt-outs")).toBeUndefined();
    expect(link("Referrals")?.to).toBe(routes.referrals);
    expect(link("Referrals")?.icon.fn).toBe(HandshakeIcon);
  });
});
