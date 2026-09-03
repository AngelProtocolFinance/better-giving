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
 *  params, so a term surviving a filter change is only visible with both up.
 *  `queried` collects the term every load asks for — the box's own reads are
 *  the fetcher's, and the term it sends is what the grid is filtered by. */
async function render_toolbar(entry: string, queried: string[] = []) {
  const Stub = createRoutesStub([
    {
      path: "/marketplace",
      Component: () => (
        <>
          <Search />
          <ActiveFilters />
        </>
      ),
      loader: ({ request }) => {
        queried.push(new URL(request.url).searchParams.get("query") ?? "");
        return null;
      },
    },
  ]);
  return render(<Stub initialEntries={[entry]} />);
}

/** react installs its own `value` setter on the node and compares against it to
 *  decide whether a change event is real, so assigning `input.value` directly
 *  makes react skip onChange. reaching the prototype setter is what lets a
 *  keystroke and the click after it share one tick — a wall-clock gap between
 *  them would let the debounce window close and the test assert nothing. */
function keystroke(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
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

  // the box empties and the debounce timer does not: left running, it loads the
  // typed term half a second after the clear, and the grid ends up filtered by
  // a word that is in neither the box nor the url.
  test("a keystroke still debouncing when Clear all fires never loads", async () => {
    const queried: string[] = [];
    const screen = await render_toolbar(
      "/marketplace?query=clean%20water&countries=Japan,Kenya",
      queried
    );

    const box = screen.getByPlaceholder(/search organizations/i);
    await expect.element(box).toHaveValue("clean water");

    keystroke(box.element() as HTMLInputElement, "kelp");
    (
      screen.getByRole("button", { name: "Clear all" }).element() as HTMLElement
    ).click();

    await expect.element(box).toHaveValue("");
    await new Promise((r) => setTimeout(r, 700));

    expect(queried).not.toContain("kelp");
  });
});
