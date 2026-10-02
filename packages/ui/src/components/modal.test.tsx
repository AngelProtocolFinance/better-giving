import { useState } from "react";
import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Form } from "./form/form";
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

// native clicks throughout — the backdrop intercepts playwright's pointer check
const click = (el: Element) => (el as HTMLElement).click();

let set_busy: (b: boolean) => void = () => {};
let set_open: (o: boolean) => void = () => {};
/**
 * a form that raises a prompt from its submit handler while its fieldset is
 * still disabled — the request is held open until the test settles it
 */
function SubmitPrompt({ same_commit }: { same_commit: boolean }) {
  const [busy, _set_busy] = useState(false);
  const [open, _set_open] = useState(false);
  set_busy = _set_busy;
  set_open = _set_open;
  return (
    <>
      <Form
        disabled={busy}
        onSubmit={(e) => {
          e.preventDefault();
          _set_busy(true);
          if (same_commit) _set_open(true);
        }}
      >
        <button type="submit">Save</button>
      </Form>
      <Modal open={open} onClose={() => _set_open(false)}>
        <h2>Couldn't save</h2>
        <button type="button" onClick={() => _set_open(false)}>
          Close
        </button>
      </Modal>
    </>
  );
}

describe("Modal return focus", () => {
  test.each([
    ["in the same commit as", true],
    ["in a later commit than", false],
  ])(
    "a prompt raised %s the submit's disable returns focus to the submit button",
    async (_, same_commit) => {
      await render(<SubmitPrompt same_commit={same_commit} />);
      const save = page.getByRole("button", { name: "Save" });
      // the open dialog hides the page below from the a11y tree, so the role
      // locator can't resolve the button again until it closes
      const save_el = save.element() as HTMLButtonElement;
      save_el.focus();
      click(save_el);
      await expect.element(save).toBeDisabled();
      expect(document.activeElement).toBe(document.body);
      if (!same_commit) set_open(true);
      const dialog = page.getByRole("dialog");
      await expect.element(dialog).toBeVisible();
      await expect
        .poll(() => dialog.element().contains(document.activeElement))
        .toBe(true);

      set_busy(false);
      await expect.poll(() => save_el.disabled).toBe(false);
      click(page.getByRole("button", { name: "Close" }).element());

      await expect.element(dialog).not.toBeInTheDocument();
      await expect.element(save).toHaveFocus();
    }
  );

  test("closed before the request settles, focus returns once the fieldset re-enables", async () => {
    await render(<SubmitPrompt same_commit />);
    const save = page.getByRole("button", { name: "Save" });
    (save.element() as HTMLElement).focus();
    click(save.element());
    const dialog = page.getByRole("dialog");
    await expect
      .poll(() => dialog.element().contains(document.activeElement))
      .toBe(true);

    click(page.getByRole("button", { name: "Close" }).element());
    await expect.element(dialog).not.toBeInTheDocument();
    set_busy(false);
    await expect.element(save).toBeEnabled();

    await expect.element(save).toHaveFocus();
  });

  test("a modal opened from a button returns focus to that button", async () => {
    function Opener() {
      const [open, set] = useState(false);
      return (
        <>
          <button type="button" onClick={() => set(true)}>
            Open
          </button>
          <Modal open={open} onClose={() => set(false)}>
            <h2>Details</h2>
            <button type="button" onClick={() => set(false)}>
              Close
            </button>
          </Modal>
        </>
      );
    }
    await render(<Opener />);
    const opener = page.getByRole("button", { name: "Open" });
    await opener.click();
    const dialog = page.getByRole("dialog");
    await expect
      .poll(() => dialog.element().contains(document.activeElement))
      .toBe(true);
    click(page.getByRole("button", { name: "Close" }).element());

    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(opener).toHaveFocus();
  });
});

describe("Modal return focus, beyond the submit button", () => {
  test("a confirm opened from inside the form and closed as it disables returns focus to the form", async () => {
    function Confirm() {
      const [busy, set_busy] = useState(false);
      const [open, set_open] = useState(false);
      return (
        <Form disabled={busy}>
          <button type="button" onClick={() => set_open(true)}>
            Delete
          </button>
          <Modal open={open} onClose={() => set_open(false)}>
            <h2>Delete this account?</h2>
            <button
              type="button"
              onClick={() => {
                set_busy(true);
                set_open(false);
              }}
            >
              Confirm
            </button>
          </Modal>
        </Form>
      );
    }
    await render(<Confirm />);
    const opener = page.getByRole("button", { name: "Delete" });
    const form = (opener.element() as HTMLElement).closest("form")!;
    await opener.click();
    const dialog = page.getByRole("dialog");
    await expect
      .poll(() => dialog.element().contains(document.activeElement))
      .toBe(true);

    click(page.getByRole("button", { name: "Confirm" }).element());

    await expect.element(dialog).not.toBeInTheDocument();
    await expect.poll(() => document.activeElement).toBe(form);
  });

  test("another form's request settling doesn't drop this form's return target", async () => {
    let set_a: (b: boolean) => void = () => {};
    let set_b: (b: boolean) => void = () => {};
    let set_open_two: (o: boolean) => void = () => {};
    function TwoForms() {
      const [a, _set_a] = useState(false);
      const [b, _set_b] = useState(false);
      const [open, set_open] = useState(false);
      set_a = _set_a;
      set_b = _set_b;
      set_open_two = set_open;
      return (
        <>
          <Form disabled={a}>
            <button type="submit">Save A</button>
          </Form>
          <Form disabled={b}>
            <button type="submit">Save B</button>
          </Form>
          <Modal open={open} onClose={() => set_open(false)}>
            <h2>Couldn't save A</h2>
            <button type="button" onClick={() => set_open(false)}>
              Close
            </button>
          </Modal>
        </>
      );
    }
    await render(<TwoForms />);
    const save_a = page.getByRole("button", { name: "Save A" });
    const save_b = page.getByRole("button", { name: "Save B" });
    const save_a_el = save_a.element() as HTMLButtonElement;

    save_a_el.focus();
    set_a(true);
    await expect.element(save_a).toBeDisabled();
    (save_b.element() as HTMLElement).focus();
    set_b(true);
    await expect.element(save_b).toBeDisabled();
    set_b(false);
    await expect.element(save_b).toHaveFocus();
    (save_b.element() as HTMLElement).blur();

    set_open_two(true);
    const dialog = page.getByRole("dialog");
    await expect
      .poll(() => dialog.element().contains(document.activeElement))
      .toBe(true);
    set_a(false);
    await expect.poll(() => save_a_el.disabled).toBe(false);
    click(page.getByRole("button", { name: "Close" }).element());

    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(save_a).toHaveFocus();
  });
});
