import { useState } from "react";
import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Modal } from "./modal";
import { Prompt } from "./prompt";

const noop = () => {};

describe("Modal accessible name", () => {
  test("is named by the first heading in its content", async () => {
    await render(
      <Modal open onClose={noop}>
        <h2>Delete program</h2>
        <p>This can't be undone.</p>
        <h3>Linked forms</h3>
      </Modal>
    );
    await expect
      .element(
        page.getByRole("dialog", { name: "Delete program", exact: true })
      )
      .toBeVisible();
  });

  test("an explicit title names it over any heading", async () => {
    await render(
      <Modal open onClose={noop} title="X">
        <h2>Delete program</h2>
      </Modal>
    );
    await expect
      .element(page.getByRole("dialog", { name: "X", exact: true }))
      .toBeVisible();
  });

  test("the name follows the heading when the content swaps step", async () => {
    function Steps() {
      const [done, set_done] = useState(false);
      return done ? (
        <h3>Match voided</h3>
      ) : (
        <>
          <h3>Void employer match</h3>
          <button type="button" onClick={() => set_done(true)}>
            Void
          </button>
        </>
      );
    }
    await render(
      <Modal open onClose={noop}>
        <Steps />
      </Modal>
    );
    await expect
      .element(
        page.getByRole("dialog", { name: "Void employer match", exact: true })
      )
      .toBeVisible();
    // native click — the backdrop intercepts playwright's pointer check
    (
      page.getByRole("button", { name: "Void" }).element() as HTMLElement
    ).click();
    await expect
      .element(page.getByRole("dialog", { name: "Match voided", exact: true }))
      .toBeVisible();
  });
});

describe("Prompt accessible name", () => {
  test.each([
    ["success", "Success"],
    ["error", "Error"],
  ] as const)("a prompt of type %s is named %s", async (type, name) => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <Prompt type={type} onClose={noop}>
            Review submitted
          </Prompt>
        ),
      },
    ]);
    await render(<Stub />);
    await expect
      .element(page.getByRole("dialog", { name, exact: true }))
      .toBeVisible();
  });
});
