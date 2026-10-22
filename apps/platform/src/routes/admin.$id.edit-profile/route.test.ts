import { describe, expect, it } from "vitest";
import { loader } from "./route";

describe("edit profile", () => {
  it("redirects to the organization page's Better Giving Page section", () => {
    const res = loader({ params: { id: "7" } } as never) as Response;
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/admin/7/organization#page");
  });
});
