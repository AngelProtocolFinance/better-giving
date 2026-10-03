import { createRoutesStub, Outlet } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { layer_ready, settle_frames } from "#/__tests__/fixtures/layer-ready";
import VideoEditor from "./video-editor";

describe("video editor dialog while its form submits", () => {
  test("holds Escape until the save resolves, then closes on it", async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => {
      release = r;
    });
    const action = vi.fn(async () => {
      await held;
      return { error: "could not save" };
    });
    const Stub = createRoutesStub([
      {
        path: "/admin/1/media",
        Component: () => (
          <>
            <p>media list</p>
            <Outlet />
          </>
        ),
        children: [{ path: "new", Component: VideoEditor, action }],
      },
    ]);
    const screen = await render(
      <Stub initialEntries={["/admin/1/media/new"]} />
    );
    const heading = screen.getByRole("heading", { name: /add video/i });
    await expect.element(heading).toBeVisible();

    await screen
      .getByLabelText(/web address/i)
      .fill("https://youtu.be/dQw4w9WgXcQ");
    await layer_ready();
    // the dialog's backdrop intercepts playwright's pointer actionability
    (
      screen.getByRole("button", { name: /continue/i }).element() as HTMLElement
    ).click();
    await vi.waitFor(() => expect(action).toHaveBeenCalledOnce());

    await userEvent.keyboard("{Escape}");
    await settle_frames();
    await expect.element(heading).toBeVisible();

    release();
    // the same press now closes it: proof the listener above was live
    await vi.waitFor(async () => {
      await userEvent.keyboard("{Escape}");
      await expect.element(heading).not.toBeInTheDocument();
    });
  });
});
