import {
  type ActionFunctionArgs,
  createRoutesStub,
  Link,
  Outlet,
} from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { Prompt } from "./prompt";

/** an action held open until the test lets every call so far answer */
const held_action = () => {
  const held: (() => void)[] = [];
  const action = vi.fn(async (_: ActionFunctionArgs) => {
    await new Promise<void>((r) => held.push(r));
    return null;
  });
  const release = () => {
    for (const r of held.splice(0)) r();
  };
  return { action, release };
};

const stub = (action: (args: ActionFunctionArgs) => Promise<null>) =>
  createRoutesStub([
    {
      path: "/redeem-requests",
      Component: () => (
        <>
          <p>requests list</p>
          <Link to="/redeem-requests/tx-2/approve">open tx-2</Link>
          <Outlet />
        </>
      ),
      children: [
        {
          path: ":tx_id/approve",
          Component: () => <Prompt verdict="approve" />,
          action,
        },
      ],
    },
  ]);

// native clicks throughout: the dialog backdrop fails playwright's
// actionability check
const press = (el: Element) => (el as HTMLElement).click();

describe("redeem request verdict prompt", () => {
  test("Submit holds focus while the verdict is in flight and a second press sends nothing", async () => {
    const { action, release } = held_action();
    const Stub = stub(action);
    const screen = await render(
      <Stub initialEntries={["/redeem-requests/tx-1/approve"]} />
    );

    const submit = screen.getByRole("button", { name: "Submit" });
    await expect.element(submit).not.toHaveAttribute("aria-disabled", "true");

    (submit.element() as HTMLElement).focus();
    press(submit.element());
    await vi.waitFor(() => expect(action).toHaveBeenCalledOnce());

    const pending = screen.getByRole("button", { name: "Submitting…" });
    // the fetcher's state lands in a transition, a render after the action starts
    await expect.element(pending).toHaveAttribute("aria-disabled", "true");
    await expect.element(pending).toHaveFocus();

    press(pending.element());
    release();
    await expect
      .element(screen.getByRole("button", { name: "Submit" }))
      .not.toHaveAttribute("aria-disabled", "true");
    expect(action).toHaveBeenCalledOnce();
  });

  test("two submits in the same tick, before any render, send one verdict", async () => {
    const { action, release } = held_action();
    const Stub = stub(action);
    const screen = await render(
      <Stub initialEntries={["/redeem-requests/tx-1/approve"]} />
    );

    const submit = screen.getByRole("button", { name: "Submit" });
    await expect.element(submit).toBeInTheDocument();
    const form = (submit.element() as HTMLButtonElement).form!;
    form.requestSubmit();
    form.requestSubmit();

    await expect
      .element(screen.getByRole("button", { name: "Submitting…" }))
      .toBeInTheDocument();
    release();
    await expect
      .element(screen.getByRole("button", { name: "Submit", exact: true }))
      .toBeInTheDocument();
    expect(action).toHaveBeenCalledOnce();
  });

  test("Close and Back stay put while the verdict is in flight, and leave once it lands", async () => {
    const { action, release } = held_action();
    const Stub = stub(action);
    const screen = await render(
      <Stub initialEntries={["/redeem-requests/tx-1/approve"]} />
    );

    press(screen.getByRole("button", { name: "Submit" }).element());
    const pending = screen.getByRole("button", { name: "Submitting…" });
    await expect.element(pending).toBeInTheDocument();

    const close = screen.getByRole("link", { name: "Close" });
    const back = screen.getByRole("link", { name: "Back" });
    await expect.element(close).toHaveAttribute("aria-disabled", "true");
    await expect.element(back).toHaveAttribute("aria-disabled", "true");
    press(close.element());
    press(back.element());
    await expect.element(pending).toBeInTheDocument();

    release();
    await expect.element(back).not.toHaveAttribute("aria-disabled", "true");
    press(back.element());
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect.element(screen.getByText("requests list")).toBeVisible();
  });

  test("Close pressed in the same tick as Submit, before any render, stays put", async () => {
    const { action, release } = held_action();
    const Stub = stub(action);
    const screen = await render(
      <Stub initialEntries={["/redeem-requests/tx-1/approve"]} />
    );

    const submit = screen.getByRole("button", { name: "Submit" });
    await expect.element(submit).toBeInTheDocument();
    (submit.element() as HTMLButtonElement).form!.requestSubmit();
    press(screen.getByRole("link", { name: "Close" }).element());

    await expect
      .element(screen.getByRole("button", { name: "Submitting…" }))
      .toBeInTheDocument();
    release();
    await expect.element(submit).toBeInTheDocument();
    expect(action).toHaveBeenCalledOnce();
  });

  test("another request opened mid-flight doesn't inherit the pending verdict, and its own submit goes out", async () => {
    const { action, release } = held_action();
    const Stub = stub(action);
    const screen = await render(
      <Stub initialEntries={["/redeem-requests/tx-1/approve"]} />
    );

    press(screen.getByRole("button", { name: "Submit" }).element());
    await expect
      .element(screen.getByRole("button", { name: "Submitting…" }))
      .toBeInTheDocument();

    // the dialog hides the page behind it from the accessibility tree
    press(screen.container.querySelector('a[href$="/tx-2/approve"]')!);
    const submit = screen.getByRole("button", { name: "Submit", exact: true });
    await expect.element(submit).toBeInTheDocument();
    await expect.element(submit).not.toHaveAttribute("aria-disabled", "true");

    // the latch resets in an effect, a beat after tx-2's Submit paints; a
    // latch that never resets swallows every press and times this out
    await vi.waitFor(() => {
      if (action.mock.calls.length < 2) press(submit.element());
      expect(action).toHaveBeenCalledTimes(2);
    });
    expect(action.mock.calls.map(([a]) => a.params.tx_id)).toEqual([
      "tx-1",
      "tx-2",
    ]);

    release();
    await Promise.all(action.mock.results.map((r) => r.value));
    await expect.element(submit).not.toHaveAttribute("aria-disabled", "true");
  });
});
