import { useLayoutEffect } from "react";
import {
  createRoutesStub,
  useLocation,
  useNavigate,
  useNavigation,
} from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ActiveFilters } from "../active-filters";
import { Search } from "./search";

async function render_search(entry: string) {
  const Stub = createRoutesStub([
    { path: "/marketplace", Component: Search, loader: () => null },
  ]);
  return render(<Stub initialEntries={[entry]} />);
}

/** the url the probe shows is the committed one; `nav-state` shows a
 *  navigation still loading, which is when a debounced write can race it */
function RouterProbe() {
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="url-search">{useLocation().search}</output>
      <output data-testid="nav-state">{useNavigation().state}</output>
      <button type="button" onClick={() => navigate(-1)}>
        Back
      </button>
      <button type="button" onClick={() => navigate(1)}>
        Forward
      </button>
    </>
  );
}

/** a loader run `hold` picks waits on the returned `release` */
function gate(hold: (url: URL) => boolean) {
  let release = () => {};
  const opened = new Promise<void>((r) => {
    release = r;
  });
  const held = { count: 0 };
  const wait = async (url: URL) => {
    if (!hold(url)) return;
    held.count++;
    await opened;
  };
  return { release: () => release(), held, wait };
}

/** the box and the chip row are separate components over one set of search
 *  params, so a term surviving a filter change is only visible with both up.
 *  `queried` collects the term every loader run asks for — the term in the url
 *  is what the grid is filtered by. */
async function render_toolbar(
  entry: string | string[],
  {
    queried = [],
    wait,
  }: { queried?: string[]; wait?: (url: URL) => Promise<void> } = {}
) {
  const Stub = createRoutesStub([
    {
      path: "/marketplace",
      Component: () => (
        <>
          <Search />
          <ActiveFilters />
          <RouterProbe />
        </>
      ),
      loader: async ({ request }) => {
        const url = new URL(request.url);
        queried.push(url.searchParams.get("query") ?? "");
        await wait?.(url);
        return null;
      },
    },
    { path: "/other", Component: () => <p>other page</p> },
  ]);
  return render(
    <Stub initialEntries={Array.isArray(entry) ? entry : [entry]} />
  );
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
  afterEach(() => {
    vi.useRealTimers();
  });

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

  // the box empties and the debounce timer does not: left running, it writes
  // the typed term half a second after the clear, and the url and the grid end
  // up filtered by a word the clear was meant to drop. with no term in the url
  // the clear leaves the term unchanged, so only the landing can tell.
  test.each([
    [
      "a term",
      "/marketplace?query=clean%20water&countries=Japan,Kenya",
      "clean water",
    ],
    ["no term", "/marketplace?countries=Japan,Kenya", ""],
  ])(
    "a keystroke still debouncing when Clear all fires never loads (url with %s)",
    async (_, entry, term) => {
      // shouldAdvanceTime keeps playwright's own polling alive while the
      // debounce timer stays ours to fire on demand
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const queried: string[] = [];
      const screen = await render_toolbar(entry, { queried });

      const box = screen.getByPlaceholder(/search organizations/i);
      await expect.element(box).toHaveValue(term);

      keystroke(box.element() as HTMLInputElement, "kelp");
      (
        screen
          .getByRole("button", { name: "Clear all" })
          .element() as HTMLElement
      ).click();

      await expect
        .element(screen.getByTestId("url-search"))
        .toHaveTextContent("?page=1");
      await expect.element(box).toHaveValue("");
      await vi.advanceTimersByTimeAsync(700);

      expect(queried).not.toContain("kelp");
      await expect.element(box).toHaveValue("");
    }
  );

  // the box's write is a navigation, and a navigation cuts off whichever one
  // is still loading. a clear whose loader outlasts the debounce window is the
  // one a slow network turns into "Clear all did nothing".
  test("a keystroke whose debounce fires while Clear all loads leaves the clear standing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const queried: string[] = [];
    const g = gate((url) => url.search === "?page=1");
    const screen = await render_toolbar(
      "/marketplace?query=clean%20water&countries=Japan,Kenya",
      { queried, wait: g.wait }
    );
    const box = screen.getByPlaceholder(/search organizations/i);
    await expect.element(box).toHaveValue("clean water");

    keystroke(box.element() as HTMLInputElement, "kelp");
    await screen.getByRole("button", { name: "Clear all" }).click();
    await expect
      .element(screen.getByTestId("nav-state"))
      .toHaveTextContent("loading");
    await vi.advanceTimersByTimeAsync(700);
    g.release();

    await expect
      .element(screen.getByTestId("url-search"))
      .toHaveTextContent("?page=1");
    await expect
      .element(screen.getByTestId("nav-state"))
      .toHaveTextContent("idle");
    await expect.element(box).toHaveValue("");
    expect(queried).not.toContain("kelp");
  });

  // the term lands in the url half a second after the last keystroke, often
  // mid-word. a box that remounts or blurs on that write eats the next letter.
  test("typing keeps focus and caret across the debounced url write", async () => {
    const screen = await render_toolbar("/marketplace");
    const box = screen.getByPlaceholder(/search organizations/i);

    await box.fill("kelp");
    await expect
      .element(screen.getByTestId("url-search"))
      .toMatchTextContent("query=kelp");

    await expect.element(box).toHaveFocus();
    await userEvent.keyboard(" farms");
    await expect.element(box).toHaveValue("kelp farms");
  });

  // the box's own write landing is not a reason to reset the box: the user
  // may have typed on while it loaded, and that keystroke is still pending
  test("typing on while the box's own write loads keeps the longer term", async () => {
    const g = gate((url) => url.searchParams.get("query") === "kelp");
    const screen = await render_toolbar("/marketplace", { wait: g.wait });
    const box = screen.getByPlaceholder(/search organizations/i);

    await box.fill("kelp");
    await vi.waitFor(() => expect(g.held.count).toBe(1));
    keystroke(box.element() as HTMLInputElement, "kelp farms");
    g.release();

    await expect
      .element(screen.getByTestId("url-search"))
      .toHaveTextContent("?query=kelp+farms");
    await expect.element(box).toHaveValue("kelp farms");
  });

  // the server-rendered box takes input before hydration finishes; the effect
  // that syncs the box to the url must not treat its own mount as a landing
  test("text in the box before its first effect runs survives it", async () => {
    /** writes the box inside the mount commit, ahead of the box's own effect */
    function EarlyTypist() {
      useLayoutEffect(() => {
        const box = document.querySelector<HTMLInputElement>(
          'input[type="search"]'
        );
        if (box) box.value = "kelp";
      }, []);
      return null;
    }
    const Stub = createRoutesStub([
      {
        path: "/marketplace",
        Component: () => (
          <>
            <Search />
            <EarlyTypist />
          </>
        ),
        loader: () => null,
      },
    ]);
    const screen = await render(<Stub initialEntries={["/marketplace"]} />);

    await expect
      .element(screen.getByPlaceholder(/search organizations/i))
      .toHaveValue("kelp");
  });

  // Back from a search returns to the list it started from; the partial
  // terms typed on the way there are not stops worth a Back press each
  test("a visit's first term pushes an entry and refining it replaces", async () => {
    const screen = await render_toolbar("/marketplace");
    const box = screen.getByPlaceholder(/search organizations/i);
    const url = screen.getByTestId("url-search");

    await box.fill("kelp");
    await expect.element(url).toHaveTextContent("?query=kelp");
    await box.fill("kelp farms");
    await expect.element(url).toHaveTextContent("?query=kelp+farms");
    await screen.getByRole("button", { name: "Back" }).click();

    await expect.element(url).not.toMatchTextContent("query");
    await expect.element(box).toHaveValue("");
  });

  test("a term typed and deleted inside one debounce window adds no entry", async () => {
    const queried: string[] = [];
    const screen = await render_toolbar(["/other", "/marketplace"], {
      queried,
    });
    const box = screen.getByPlaceholder(/search organizations/i);
    await expect.element(box).toHaveValue("");

    keystroke(box.element() as HTMLInputElement, "kelp");
    keystroke(box.element() as HTMLInputElement, "");
    await vi.waitFor(() => expect(queried).toHaveLength(2));
    await screen.getByRole("button", { name: "Back" }).click();

    await expect.element(screen.getByText("other page")).toBeVisible();
  });

  // history hands back the state an entry was written with, so the entry the
  // box wrote reads as the box's own write every time it is returned to
  test("Forward onto an entry the box wrote puts its term back in the box", async () => {
    const screen = await render_toolbar("/marketplace");
    const box = screen.getByPlaceholder(/search organizations/i);
    const url = screen.getByTestId("url-search");

    await box.fill("kelp");
    await expect.element(url).toHaveTextContent("?query=kelp");
    await screen.getByRole("button", { name: "Back" }).click();
    await expect.element(box).toHaveValue("");
    await screen.getByRole("button", { name: "Forward" }).click();

    await expect.element(url).toHaveTextContent("?query=kelp");
    await expect.element(box).toHaveValue("kelp");
  });

  // `?query=` is a shared link naming a filter that isn't there
  test("clearing the box takes query out of the url", async () => {
    const screen = await render_toolbar(
      "/marketplace?query=kelp&countries=Japan"
    );
    const box = screen.getByPlaceholder(/search organizations/i);
    await expect.element(box).toHaveValue("kelp");

    await box.clear();

    await expect
      .element(screen.getByTestId("url-search"))
      .toHaveTextContent("?countries=Japan");
  });

  // a new term starts its own results; a page kept from the last term reads
  // as an empty or wrong page of the new one
  test("typing a new term drops the page from the url", async () => {
    const screen = await render_toolbar("/marketplace?page=3&countries=Japan");

    await screen.getByPlaceholder(/search organizations/i).fill("kelp");

    await expect
      .element(screen.getByTestId("url-search"))
      .toHaveTextContent("?countries=Japan&query=kelp");
  });
});
