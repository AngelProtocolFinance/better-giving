import { describe, expect, test } from "vitest";
import { via_name } from "./helpers";

describe("via_name", () => {
  // the label is donor- and nonprofit-visible: it feeds the zapier trigger and
  // the admin donations table, so the employer's gift must not surface as the
  // raw `match` token the funnel keys off
  test("names the employer's own gift", () => {
    expect(via_name("match")).toBe("Employer match");
  });

  test("leaves the neighbouring vias alone", () => {
    expect(via_name("cheque")).toBe("Cheque");
    expect(via_name("daf")).toBe("DAF");
  });
});
