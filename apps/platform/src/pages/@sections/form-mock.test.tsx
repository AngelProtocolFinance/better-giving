import { afterEach, describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { FormMock } from "./form-mock";

const interval_ms = 150;
const sentence =
  "Illustration of the Better Giving donation form, which accepts card, stock, donor-advised fund and crypto gifts.";

/** the drawing is aria-hidden, so no role query reaches it */
const drawing = (root: Element) =>
  root.querySelector<HTMLElement>("[data-active]") as HTMLElement;

/** the component mounts under wherever the test runner left the pointer,
 *  which reads as a hover; every test starts with the pointer off it.
 *  `unhover` parks the pointer at the body's centre, which a mock taller than
 *  half the viewport covers, so the pointer goes to a sibling instead */
async function mount(reduce: boolean) {
  stub_reduced_motion(reduce);
  const screen = await render(
    <>
      <FormMock interval_ms={interval_ms} />
      <p>elsewhere</p>
    </>
  );
  const root = page.elementLocator(screen.container.firstElementChild!);
  const move_off = () => screen.getByText("elsewhere").hover();
  await move_off();
  return { screen, root, move_off, el: drawing(screen.container) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** platform's browser project registers no `emulateMedia` command, so the
 *  media query is answered by a stub instead */
function stub_reduced_motion(reduce: boolean) {
  const real = window.matchMedia.bind(window);
  vi.spyOn(window, "matchMedia").mockImplementation((q) =>
    q === "(prefers-reduced-motion: reduce)"
      ? ({
          ...real(q),
          matches: reduce,
          media: q,
          addEventListener: () => {},
          removeEventListener: () => {},
        } as MediaQueryList)
      : real(q)
  );
}

describe("FormMock", () => {
  afterEach(async () => {
    await cleanup();
    vi.restoreAllMocks();
  });

  test("is hidden from assistive tech behind one sentence, and cycles its gift types", async () => {
    const { screen, el } = await mount(false);

    await expect.element(screen.getByText(sentence)).toBeInTheDocument();
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.inert).toBe(true);
    expect(el.querySelectorAll("button, input, a, [tabindex]").length).toBe(0);

    // the first face may already have turned while the pointer moved off, so
    // the assertion is the order, not the starting point
    const order = ["card", "stock", "daf", "crypto"];
    const next_of = (id?: string) =>
      order[(order.indexOf(id ?? "") + 1) % order.length];
    const first = el.dataset.active;
    await vi.waitFor(() => expect(el.dataset.active).toBe(next_of(first)));
    await vi.waitFor(() =>
      expect(el.dataset.active).toBe(next_of(next_of(first)))
    );
  });

  test("holds its face while hovered, and resumes when the pointer leaves", async () => {
    const { root, move_off, el } = await mount(false);

    await root.hover();
    const held = el.dataset.active;
    await sleep(interval_ms * 4);
    expect(el.dataset.active).toBe(held);

    await move_off();
    await vi.waitFor(() => expect(el.dataset.active).not.toBe(held));
  });

  test("the toggle stops the cycle, and starts it again", async () => {
    const { screen, move_off, el } = await mount(false);

    // a click leaves the pointer on the toggle, which is a hover of its own;
    // moving off it is what proves the button, not the pointer, holds the face
    await screen.getByRole("button", { name: "Pause animation" }).click();
    await move_off();
    const held = el.dataset.active;
    await sleep(interval_ms * 4);
    expect(el.dataset.active).toBe(held);

    await screen.getByRole("button", { name: "Play animation" }).click();
    await move_off();
    await vi.waitFor(() => expect(el.dataset.active).not.toBe(held));
    await expect
      .element(screen.getByRole("button", { name: "Pause animation" }))
      .toBeInTheDocument();
  });

  test("never advances under prefers-reduced-motion, and offers no toggle", async () => {
    const { screen, el } = await mount(true);

    await sleep(interval_ms * 4);
    expect(el.dataset.active).toBe("card");
    expect(screen.container.querySelector("button")).toBeNull();
  });
});
