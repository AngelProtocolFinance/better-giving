import { safeParse } from "valibot";
import { describe, expect, it } from "vitest";
import { segment_shape } from "@/schemas";
import { link_from_name } from "./link";

describe("link_from_name", () => {
  it("lowercases and joins words with a hyphen", () => {
    expect(link_from_name("Winter Coat Drive")).toBe("winter-coat-drive");
  });

  it("drops characters a link segment cannot hold", () => {
    expect(link_from_name("Kids' Books & Toys!")).toBe("kids-books-toys");
  });

  it("returns a value the slug schema accepts", () => {
    for (const name of [
      "  ..Spring.. Gala  ",
      "A very long campaign name that runs past thirty characters",
      "Año Nuevo 2027",
    ]) {
      const out = link_from_name(name);
      expect(safeParse(segment_shape, out).success, out).toBe(true);
    }
  });

  it("is empty for a name with nothing usable", () => {
    expect(link_from_name("  !!  ")).toBe("");
  });
});
