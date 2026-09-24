import { type ComponentType, type ReactNode, useState } from "react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Fieldset, Form, RmxForm } from "./form";

type FormLike = ComponentType<{ disabled?: boolean; children: ReactNode }>;

// flips `disabled` in place, so the form stays mounted across the request the
// way a route's `isSubmitting` does
let set_disabled: (d: boolean) => void = () => {};
// a save gated on `isDirty` stays disabled after a successful save + reset
let set_save_disabled: (d: boolean) => void = () => {};
function Harness({ form: F }: { form: FormLike }) {
  const [disabled, set] = useState<boolean | undefined>(undefined);
  const [save_disabled, set_save] = useState(false);
  set_disabled = set;
  set_save_disabled = set_save;
  return (
    <>
      <F disabled={disabled}>
        <label>
          Name
          <input name="name" />
        </label>
        <button type="submit" disabled={save_disabled}>
          Save
        </button>
      </F>
      <button type="button">Elsewhere</button>
      <output data-testid="committed">{String(disabled)}</output>
    </>
  );
}

function PlainForm({
  disabled,
  children,
}: {
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <form>
      <Fieldset disabled={disabled} className="contents">
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
});
