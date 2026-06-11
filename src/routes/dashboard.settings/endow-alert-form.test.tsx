import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import type { IUserNpo2 } from "#/types/user";
import { EndowAlertForm } from "./endow-alert-form";

function stub(user_npos: IUserNpo2[]) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => <EndowAlertForm user_npos={user_npos} />,
      action: () => null,
    },
  ]);
  return Stub;
}

describe("EndowAlertForm", () => {
  it("empty org list shows info message, no form", async () => {
    const Stub = stub([]);
    const screen = await render(<Stub />);
    await expect
      .element(screen.getByText("No organizations found"))
      .toBeVisible();
    expect(screen.getByRole("button", { name: /save/i }).query()).toBeNull();
  });

  it("user toggles prefs across orgs, submits, then resets", async () => {
    const npos: IUserNpo2[] = [
      {
        id: 1,
        name: "Save the Trees",
        alert_pref: { donation: true, banking: false },
      },
      {
        id: 2,
        name: "Ocean Fund",
        alert_pref: { donation: false, banking: true },
      },
    ];
    const Stub = stub(npos);
    const screen = await render(<Stub />);

    // org names rendered
    await expect.element(screen.getByText("Save the Trees")).toBeVisible();
    await expect.element(screen.getByText("Ocean Fund")).toBeVisible();

    // checkboxes: [trees-donation, trees-banking, ocean-donation, ocean-banking]
    const checkboxes = screen.getByRole("checkbox").all();
    expect(checkboxes).toHaveLength(4);

    // initial state matches alert_pref
    await expect.element(checkboxes[0]).toBeChecked(); // trees donation=true
    await expect.element(checkboxes[1]).not.toBeChecked(); // trees banking=false
    await expect.element(checkboxes[2]).not.toBeChecked(); // ocean donation=false
    await expect.element(checkboxes[3]).toBeChecked(); // ocean banking=true

    const save_btn = screen.getByRole("button", { name: /save/i });
    const reset_btn = screen.getByRole("button", { name: /reset/i });
    await expect.element(save_btn).toBeDisabled();
    await expect.element(reset_btn).toBeDisabled();

    // toggle trees banking on, ocean donation on
    await checkboxes[1].click();
    await checkboxes[2].click();

    await expect.element(save_btn).toBeEnabled();
    await expect.element(reset_btn).toBeEnabled();

    // submit — button returns to "save" after completion
    await save_btn.click();
    await expect
      .element(screen.getByRole("button", { name: /save/i }))
      .toBeVisible();

    // reset after another toggle
    await checkboxes[0].click();
    await expect.element(checkboxes[0]).not.toBeChecked();
    await reset_btn.click();
    // reverts to initial loaded state
    await expect.element(checkboxes[0]).toBeChecked();
    await expect.element(checkboxes[1]).not.toBeChecked();
  });

  it("new org with no alert_pref defaults both prefs on, user unchecks one and submits", async () => {
    const Stub = stub([{ id: 3, name: "New Org" }]);
    const screen = await render(<Stub />);

    await expect.element(screen.getByText("New Org")).toBeVisible();

    // both default to checked when alert_pref is undefined
    const checkboxes = screen.getByRole("checkbox").all();
    expect(checkboxes).toHaveLength(2);
    await expect.element(checkboxes[0]).toBeChecked(); // donation
    await expect.element(checkboxes[1]).toBeChecked(); // banking

    // uncheck donation, submit
    await checkboxes[0].click();
    await expect.element(checkboxes[0]).not.toBeChecked();
    await expect.element(checkboxes[1]).toBeChecked();

    await screen.getByRole("button", { name: /save/i }).click();
    await expect
      .element(screen.getByRole("button", { name: /save/i }))
      .toBeVisible();
  });
});
