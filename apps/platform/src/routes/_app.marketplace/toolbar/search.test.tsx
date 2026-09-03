import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Search } from "./search";

async function render_search(entry: string) {
  const Stub = createRoutesStub([
    { path: "/marketplace", Component: Search, loader: () => null },
  ]);
  return render(<Stub initialEntries={[entry]} />);
}

describe("marketplace search box", () => {
  // the term has to round-trip out of the url as well as into it: a filtered
  // grid above an empty box reads as broken data, not as a filter to clear.
  test("a shared ?query= link shows its term in the box", async () => {
    const screen = await render_search("/marketplace?query=clean%20water");

    await expect
      .element(screen.getByPlaceholder(/search organizations/i))
      .toHaveValue("clean water");
  });

  test("no query param leaves the box empty", async () => {
    const screen = await render_search("/marketplace");

    await expect
      .element(screen.getByPlaceholder(/search organizations/i))
      .toHaveValue("");
  });
});
