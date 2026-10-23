import { describe, expect, it } from "vitest";
import { loader } from "./route";

describe("old profile url", () => {
  it("redirects to /org/<id>, keeping the query", () => {
    const res = loader({
      params: { id: "7" },
      request: new Request("https://x/profile/7?referrer=R1"),
    } as never) as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/org/7?referrer=R1");
  });
});
