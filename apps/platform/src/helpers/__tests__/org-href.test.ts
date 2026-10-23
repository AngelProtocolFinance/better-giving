import { describe, expect, test } from "vitest";
import { org_href, program_href } from "../org-href";

describe("org href", () => {
  test("an org with a slug lives at its slug", () => {
    expect(org_href({ id: 7, slug: "acme" })).toBe("/org/acme");
  });
  test("an org without a slug lives at its id", () => {
    expect(org_href({ id: 7 })).toBe("/org/7");
    expect(org_href({ id: 7, slug: null })).toBe("/org/7");
    expect(org_href({ id: "7", slug: "" })).toBe("/org/7");
  });
});

describe("program href", () => {
  test("a program sits under its org's slug", () => {
    expect(program_href({ id: 7, slug: "acme" }, "p1")).toBe(
      "/org/acme/program/p1"
    );
  });
  test("a program of an org without a slug sits under its id", () => {
    expect(program_href({ id: 7, slug: null }, "p1")).toBe("/org/7/program/p1");
  });
});
