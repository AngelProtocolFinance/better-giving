import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { SetPasswordForm } from "./set-password-form";

describe("SetPasswordForm", () => {
  test("asks the password manager for a new password saved under the account", async () => {
    const Stub = createRoutesStub([
      {
        path: "/login/reset",
        Component: () => <SetPasswordForm email="d@example.com" token="tok" />,
      },
    ]);
    const screen = await render(<Stub initialEntries={["/login/reset"]} />);

    for (const label of ["New Password", "Confirm New Password"]) {
      await expect
        .element(screen.getByLabelText(label, { exact: true }))
        .toHaveAttribute("autocomplete", "new-password");
    }

    // a manager reads the account off a visible-type field, never a hidden one
    const username = screen.container.querySelector<HTMLInputElement>(
      'input[autocomplete="username"]'
    );
    expect(username?.type).toBe("text");
    expect(username?.value).toBe("d@example.com");
  });
});
