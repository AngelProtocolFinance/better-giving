import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { ActiveFilters } from "../active-filters";
import { Search } from "./search";

async function render_search(entry: string) {
  const Stub = createRoutesStub([
    { path: "/marketplace", Component: Search, loader: () => null },
  ]);
  return render(<Stub initialEntries={[entry]} />);
}

/** the box and the chip row are separate components over one set of search
 *  params, so a term surviving a filter change is only visible with both up. */
async function render_toolbar(entry: string) {
  const Stub = createRoutesStub([
    {
      path: "/marketplace",
      Component: () => (
        <>
          <Search />
          <ActiveFilters />
        </>
      ),
      loader: () => null,
    },
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

  // "Clear all" drops `query` along with the chips while the route stays
  // mounted. a box still holding the cleared term names a filter the results
  // are no longer under.
  test("Clear all empties the box with the rest of the filters", async () => {
    const screen = await render_toolbar(
      "/marketplace?query=clean%20water&countries=Japan,Kenya"
    );

    await expect
      .element(screen.getByPlaceholder(/search organizations/i))
      .toHaveValue("clean water");

    await screen.getByRole("button", { name: "Clear all" }).click();

    await expect
      .element(screen.getByPlaceholder(/search organizations/i))
      .toHaveValue("");
  });
});
