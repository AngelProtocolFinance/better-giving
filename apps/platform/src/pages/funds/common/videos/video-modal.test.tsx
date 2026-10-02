import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { VideoModal } from "./video-modal";

interface IHarness {
  on_submit: (url: string) => void;
}

function Harness({ on_submit }: IHarness) {
  const [open, set_open] = useState(true);
  return <VideoModal open={open} set_open={set_open} onSubmit={on_submit} />;
}

// native clicks: the dialog backdrop fails playwright's actionability check
const press = (el: Element) => (el as HTMLElement).click();

describe("video modal", () => {
  test("an invalid URL keeps the dialog open with its error; a valid one submits and closes", async () => {
    const on_submit = vi.fn();
    const screen = await render(<Harness on_submit={on_submit} />);
    const dialog = screen.getByRole("dialog", { name: "Add video" });
    await expect.element(dialog).toBeVisible();

    const url = screen.getByLabelText("Web Address (URL)");
    await url.fill("not a url");
    press(screen.getByRole("button", { name: "Continue" }).element());

    await expect.element(screen.getByText("invalid url")).toBeVisible();
    // a closing dialog lingers through its exit animation, so read its state
    await expect.element(dialog).toHaveAttribute("data-state", "open");
    expect(on_submit).not.toHaveBeenCalled();

    await url.fill("https://youtu.be/XOUjJqQ68Ec");
    press(screen.getByRole("button", { name: "Continue" }).element());

    await vi.waitFor(() =>
      expect(on_submit).toHaveBeenCalledWith("https://youtu.be/XOUjJqQ68Ec")
    );
    await expect.element(dialog).not.toBeInTheDocument();
  });
});
