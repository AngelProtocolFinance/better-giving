import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

// every refund and chargeback reverses through `reverse_charge`; the refund
// core's internals stay behind it so a rail can't hand-roll the load/guard again
const root = join(import.meta.dirname, "../..");
const scanned = ["src", "lib", "jobs", ".server"];
const internals = /\b(dists_for_refund|process_refund|load_refund_plan)\b/;
const allowed = [".server/refund/", ".server/pg/queries/dist.ts"];

function sources(dir: string): string[] {
  return readdirSync(join(root, dir), { recursive: true, encoding: "utf8" })
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => join(dir, f));
}

describe("refund core boundary", () => {
  test("nothing outside the refund core imports its internals", () => {
    const offenders = scanned
      .flatMap(sources)
      .filter((f) => !allowed.some((a) => f.startsWith(a)))
      .filter((f) => {
        const imports = readFileSync(join(root, f), "utf8")
          .split("\n")
          .filter((l) => /^\s*(import|export)\b|from\s+["']/.test(l));
        return imports.some((l) => internals.test(l));
      })
      .map((f) => relative(root, join(root, f)));
    expect(offenders).toEqual([]);
  });
});
