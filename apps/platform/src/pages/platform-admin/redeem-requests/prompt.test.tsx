import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { Prompt } from "./prompt";

describe("redeem request verdict prompt", () => {
  test("a second Submit click while the verdict is in flight sends nothing", async () => {
    let release = () => {};
    const action = vi.fn(async () => {
      await new Promise<void>((r) => {
        release = r;
      });
      return null;
    });
    const Stub = createRoutesStub([
      {
        path: "/redeem-requests",
        children: [
          {
            path: ":tx_id/approve",
            Component: () => <Prompt verdict="approve" />,
            action,
          },
        ],
      },
    ]);
    const screen = await render(
      <Stub initialEntries={["/redeem-requests/tx-1/approve"]} />
    );

    const submit = screen.getByRole("button", { name: "Submit" });
    await expect.element(submit).toBeEnabled();

    // native click: the dialog backdrop fails playwright's actionability check
    (submit.element() as HTMLElement).click();
    await vi.waitFor(() => expect(action).toHaveBeenCalledOnce());
    // the fetcher's state lands in a transition, a render after the action starts
    await expect.element(submit).toBeDisabled();

    (submit.element() as HTMLElement).click();
    release();
    await expect.element(submit).toBeEnabled();
    expect(action).toHaveBeenCalledOnce();
  });
});
