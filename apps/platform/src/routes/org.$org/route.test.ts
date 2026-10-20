import { describe, expect, it } from "vitest";
import { loader } from "./route";

async function thrown(run: () => unknown) {
  try {
    return { value: await run() };
  } catch (err) {
    return { thrown: err };
  }
}

describe("org layout", () => {
  it("redirects the bare org path to the marketplace profile", async () => {
    const res = await thrown(() =>
      loader({
        request: new Request("https://x/org/acme"),
        params: { org: "acme" },
      } as any)
    );
    expect(res.thrown).toBeInstanceOf(Response);
    const response = res.thrown as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/marketplace/acme");
  });

  it("leaves a campaign path for the child route", async () => {
    const res = await thrown(() =>
      loader({
        request: new Request("https://x/org/acme/winter"),
        params: { org: "acme" },
      } as any)
    );
    expect(res.thrown).toBeUndefined();
    expect(res.value).toBeNull();
  });
});
