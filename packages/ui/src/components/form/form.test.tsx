import { type ComponentType, type ReactNode, useState } from "react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Fieldset, Form, RmxForm } from "./form";

type FormLike = ComponentType<{
  disabled?: boolean;
  busy?: boolean;
  children: ReactNode;
}>;

// flips `disabled` in place, so the form stays mounted across the request the
// way a route's `isSubmitting` does
let set_disabled: (d: boolean) => void = () => {};
// a save gated on `isDirty` stays disabled after a successful save + reset
let set_save_disabled: (d: boolean) => void = () => {};
// left `undefined`, the fieldset reads `disabled` as busy
let set_busy: (b: boolean | undefined) => void = () => {};
function Harness({ form: F }: { form: FormLike }) {
  const [disabled, set] = useState<boolean | undefined>(undefined);
  const [save_disabled, set_save] = useState(false);
  const [busy, _set_busy] = useState<boolean | undefined>(undefined);
  set_disabled = set;
  set_save_disabled = set_save;
  set_busy = _set_busy;
  return (
    <>
      <F disabled={disabled} busy={busy}>
        <label>
          Name
          <input name="name" />
        </label>
        <button type="submit" disabled={save_disabled}>
          Save
        </button>
      </F>
      <label>
        Note
        <input name="note" />
      </label>
      <button type="button">Elsewhere</button>
      <output data-testid="committed">{String(disabled)}</output>
    </>
  );
}

function PlainForm({
  disabled,
  busy,
  children,
}: {
  disabled?: boolean;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <form>
      <Fieldset disabled={disabled} busy={busy} className="contents">
        {children}
      </Fieldset>
    </form>
  );
}

async function mount_form() {
  return render(<Harness form={Form} />);
}

async function mount_rmx_form() {
  const Stub = createRoutesStub([
    { path: "/", Component: () => <Harness form={RmxForm} /> },
  ]);
  return render(<Stub />);
}

async function mount_fieldset() {
  return render(<Harness form={PlainForm} />);
}

describe.each([
  ["Form", mount_form],
  ["RmxForm", mount_rmx_form],
  ["Fieldset", mount_fieldset],
])("%s: focus across a request", (_, mount) => {
  it("returns focus to the submit button once the request settles", async () => {
    const screen = await mount();
    const save = screen.getByRole("button", { name: "Save" });
    (save.element() as HTMLElement).focus();

    set_disabled(true);
    await expect.element(save).toBeDisabled();
    expect(document.activeElement).toBe(document.body);
    set_disabled(false);
    await expect.element(save).toBeEnabled();

    await expect.element(save).toHaveFocus();
  });

  it("focuses the form when the submit button is still disabled after the request", async () => {
    const screen = await mount();
    const save = screen.getByRole("button", { name: "Save" });
    (save.element() as HTMLElement).focus();

    set_disabled(true);
    await expect.element(save).toBeDisabled();
    expect(document.activeElement).toBe(document.body);
    set_save_disabled(true);
    set_disabled(false);
    await expect
      .element(screen.getByTestId("committed"))
      .toHaveTextContent("false");

    const form = (save.element() as HTMLElement).closest("form")!;
    expect(document.activeElement).toBe(form);
    expect(form.tabIndex).toBe(-1);
  });

  it("gives the form no tab stop once focus leaves it", async () => {
    const screen = await mount();
    const save = screen.getByRole("button", { name: "Save" });
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    (save.element() as HTMLElement).focus();

    set_disabled(true);
    await expect.element(save).toBeDisabled();
    set_save_disabled(true);
    set_disabled(false);
    const form = (save.element() as HTMLElement).closest("form")!;
    await expect.poll(() => document.activeElement).toBe(form);

    (elsewhere.element() as HTMLElement).focus();
    expect(form.hasAttribute("tabindex")).toBe(false);
  });

  it("leaves focus where it was moved to during the request", async () => {
    const screen = await mount();
    const save = screen.getByRole("button", { name: "Save" });
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    (save.element() as HTMLElement).focus();

    set_disabled(true);
    await expect.element(save).toBeDisabled();
    (elsewhere.element() as HTMLElement).focus();
    set_disabled(false);
    await expect.element(save).toBeEnabled();

    await expect.element(elsewhere).toHaveFocus();
  });

  it("doesn't restore focus that left while the form was enabled", async () => {
    const screen = await mount();
    const save = screen.getByRole("button", { name: "Save" });
    (save.element() as HTMLElement).focus();
    (save.element() as HTMLElement).blur();

    set_disabled(false);
    await expect
      .element(screen.getByTestId("committed"))
      .toHaveTextContent("false");

    expect(document.activeElement).toBe(document.body);
  });

  it("returns focus to the submit button after a Tab pressed during the request", async () => {
    const screen = await mount();
    const save = screen.getByRole("button", { name: "Save" });
    (save.element() as HTMLElement).focus();

    set_disabled(true);
    await expect.element(save).toBeDisabled();
    expect(document.activeElement).toBe(document.body);
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).not.toBe(document.body);
    set_disabled(false);
    await expect.element(save).toBeEnabled();

    await expect.element(save).toHaveFocus();
  });

  it("leaves focus on a control clicked during the request", async () => {
    const screen = await mount();
    const save = screen.getByRole("button", { name: "Save" });
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    (save.element() as HTMLElement).focus();

    set_disabled(true);
    await expect.element(save).toBeDisabled();
    await userEvent.keyboard("{Tab}");
    await elsewhere.click();
    set_disabled(false);
    await expect.element(save).toBeEnabled();

    await expect.element(elsewhere).toHaveFocus();
  });

  it("announces the request while it is in flight, and nothing after", async () => {
    const screen = await mount();
    const status = screen.getByRole("group").getByRole("status");
    await expect.element(status).toHaveTextContent("");

    set_disabled(true);
    await expect.element(status).toHaveTextContent("Submitting…");
    set_disabled(false);
    await expect
      .element(screen.getByTestId("committed"))
      .toHaveTextContent("false");

    expect(status.element().textContent).toBe("");
  });

  it("announces nothing while disabled without being busy", async () => {
    const screen = await mount();
    const status = screen.getByRole("group").getByRole("status");
    set_busy(false);
    set_disabled(true);
    await expect
      .element(screen.getByTestId("committed"))
      .toHaveTextContent("true");

    expect(status.element().textContent).toBe("");
  });

  it("announces a busy fieldset", async () => {
    const screen = await mount();
    const status = screen.getByRole("group").getByRole("status");
    set_busy(true);
    set_disabled(true);

    await expect.element(status).toHaveTextContent("Submitting…");
  });

  it("returns focus to the submit button when busy ends before the fieldset re-enables", async () => {
    const screen = await mount();
    const save = screen.getByRole("button", { name: "Save" });
    (save.element() as HTMLElement).focus();

    set_busy(true);
    set_disabled(true);
    await expect.element(save).toBeDisabled();
    // a navigation's `submitting` ends at `loading`, still disabled
    set_busy(false);
    await expect
      .element(screen.getByRole("group").getByRole("status"))
      .toHaveTextContent("");
    set_disabled(false);
    await expect.element(save).toBeEnabled();

    await expect.element(save).toHaveFocus();
  });

  it("leaves focus on a field typed into after a Tab during the request", async () => {
    const screen = await mount();
    const save = screen.getByRole("button", { name: "Save" });
    const note = screen.getByRole("textbox", { name: "Note" });
    (save.element() as HTMLElement).focus();

    set_disabled(true);
    await expect.element(save).toBeDisabled();
    await userEvent.keyboard("{Tab}");
    await expect.element(note).toHaveFocus();
    await userEvent.keyboard("hi");
    set_disabled(false);
    await expect.element(save).toBeEnabled();

    await expect.element(note).toHaveFocus();
    await expect.element(note).toHaveValue("hi");
  });

  it("returns focus after a Tab pressed while the disabled control still held it", async () => {
    const screen = await mount();
    const save = screen.getByRole("button", { name: "Save" });
    const save_el = save.element() as HTMLElement;
    save_el.focus();

    set_disabled(true);
    await expect.element(save).toBeDisabled();
    // firefox and safari leave focus on a control that becomes disabled;
    // chromium, which runs this suite, ejects it to `<body>`
    with_active_element(save_el);
    await userEvent.keyboard("{Tab}");
    restore_active_element();
    expect(document.activeElement).not.toBe(document.body);
    set_disabled(false);
    await expect.element(save).toBeEnabled();

    await expect.element(save).toHaveFocus();
  });
});

function with_active_element(el: Element) {
  Object.defineProperty(document, "activeElement", {
    configurable: true,
    get: () => el,
  });
}
function restore_active_element() {
  Reflect.deleteProperty(document, "activeElement");
}
afterEach(restore_active_element);
