import { type ComponentType, type ReactNode, useState } from "react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Form, RmxForm } from "./form";

type FormLike = ComponentType<{ disabled?: boolean; children: ReactNode }>;

// flips `disabled` in place, so the form stays mounted across the request the
// way a route's `isSubmitting` does
let set_disabled: (d: boolean) => void = () => {};
function Harness({ form: F }: { form: FormLike }) {
  const [disabled, set] = useState<boolean | undefined>(undefined);
  set_disabled = set;
  return (
    <>
      <F disabled={disabled}>
        <label>
          Name
          <input name="name" />
        </label>
        <button type="submit">Save</button>
      </F>
      <button type="button">Elsewhere</button>
    </>
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

describe.each([
  ["Form", mount_form],
  ["RmxForm", mount_rmx_form],
])("%s: focus across a request", (_, mount) => {
  it("returns focus to the submit button once the request settles", async () => {
    const screen = await mount();
    const save = screen.getByRole("button", { name: "Save" });
    (save.element() as HTMLElement).focus();

    set_disabled(true);
    await expect.element(save).toBeDisabled();
    set_disabled(false);
    await expect.element(save).toBeEnabled();

    await expect.element(save).toHaveFocus();
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

  it("moves no focus when it was never disabled", async () => {
    const screen = await mount();
    const save = screen.getByRole("button", { name: "Save" });
    (save.element() as HTMLElement).focus();
    (save.element() as HTMLElement).blur();

    set_disabled(false);
    await expect.element(save).toBeEnabled();

    expect(document.activeElement).toBe(document.body);
  });
});
