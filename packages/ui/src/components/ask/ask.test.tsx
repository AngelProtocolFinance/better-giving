import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { _reset_asks, AskHost, type AskProps, ask, use_ask } from "./ask";

/** the shape every asked component has: reads `open`, answers, then reports the
 *  exit its dialog would have animated. */
function Question({
  label,
  open,
  resolve,
  on_closed,
}: { label: string } & AskProps<string>) {
  if (!open) return null;
  return (
    <div>
      <p>{label}</p>
      <button type="button" onClick={() => resolve(`answered ${label}`)}>
        answer
      </button>
      <button type="button" onClick={() => on_closed()}>
        exited
      </button>
    </div>
  );
}

afterEach(() => {
  _reset_asks();
});

describe("ask", () => {
  test("a keyed re-ask swaps content into the dialog already on screen", async () => {
    const screen = await render(<AskHost />);

    const first = ask<string, { label: string }>(
      Question,
      { label: "first" },
      { key: "slot" }
    );
    await expect
      .element(screen.getByText("first", { exact: true }))
      .toBeVisible();

    ask<string, { label: string }>(
      Question,
      { label: "second" },
      { key: "slot" }
    );

    // the superseded question answers undefined rather than hanging...
    expect(await first).toBeUndefined();
    // ...and the entry was reused, so the second is up with no reopen
    await expect
      .element(screen.getByText("second", { exact: true }))
      .toBeVisible();
    expect(screen.getByText("first", { exact: true }).query()).toBeNull();
  });

  test("a mid-exit entry is not taken over by its key", async () => {
    const screen = await render(<AskHost />);

    const answered = ask<string, { label: string }>(
      Question,
      { label: "leaving" },
      { key: "slot" }
    );
    await screen.getByRole("button", { name: "answer" }).click();
    expect(await answered).toBe("answered leaving");

    // still mounted, animating out — the next ask gets its own entry, so the
    // one on its way off screen can't swallow the new question
    ask<string, { label: string }>(
      Question,
      { label: "arriving" },
      { key: "slot" }
    );
    await expect
      .element(screen.getByText("arriving", { exact: true }))
      .toBeVisible();
  });

  test("the backstop unmounts a component that answers without ever exiting", async () => {
    vi.useFakeTimers();
    try {
      const screen = await render(<AskHost />);
      ask<string, { label: string }>(Question, { label: "silent" });
      await expect
        .element(screen.getByText("silent", { exact: true }))
        .toBeVisible();

      await screen.getByRole("button", { name: "answer" }).click();
      // `open` is false, so it renders nothing, but the entry is still there
      await vi.advanceTimersByTimeAsync(1000);
      expect(screen.getByRole("button", { name: "answer" }).query()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("use_ask cancels the questions its caller leaves behind", async () => {
    function Owner() {
      const ask = use_ask();
      return (
        <button
          type="button"
          onClick={() => {
            ask<string, { label: string }>(Question, { label: "owned" });
          }}
        >
          raise
        </button>
      );
    }
    function Page() {
      const [mounted, set_mounted] = useState(true);
      return (
        <>
          {mounted && <Owner />}
          <button type="button" onClick={() => set_mounted(false)}>
            unmount
          </button>
          <AskHost />
        </>
      );
    }

    const screen = await render(<Page />);
    await screen.getByRole("button", { name: "raise" }).click();
    await expect
      .element(screen.getByText("owned", { exact: true }))
      .toBeVisible();

    await screen.getByRole("button", { name: "unmount" }).click();
    // the dialog goes with the component that raised it, as the conditional
    // mount it replaces did
    await expect
      .element(screen.getByText("owned", { exact: true }))
      .not.toBeInTheDocument();
  });

  test("without a host nothing renders and the caller is told why", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await render(<div>no host</div>);

    ask<string, { label: string }>(Question, { label: "unheard" });

    expect(err).toHaveBeenCalledWith(expect.stringContaining("<AskHost />"));
    err.mockRestore();
  });
});
