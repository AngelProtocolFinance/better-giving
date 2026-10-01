import type { ComponentType } from "react";
import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import type { ILeadValues } from "@/reg/lead";

type Screen = Awaited<ReturnType<typeof render>>;
type Locator = ReturnType<Screen["getByLabelText"]>;

interface ILeadFormProps {
  errors?: Record<string, string>;
  values?: ILeadValues;
  signed_in_as?: string;
  message?: string;
  pending?: boolean;
}

export interface ILeadFormCase {
  /** label of the field carrying the org's name */
  name_label: RegExp;
  /** accessible name of the resting submit button */
  submit_label: RegExp;
  /** label of the work-email field */
  email_label: RegExp;
  /** a full echo of a failed submit, as the action sends it back */
  values: ILeadValues;
  /** field → message, as the action marks them */
  errors: Record<string, string>;
  /** the field the errors above hand focus to — the first one in ask order */
  first_marked: (screen: Screen) => Locator;
}

/** the behaviors both landing lead forms assert: what a marked round trip
 *  renders and focuses, what it hands back, and what pending locks. anything
 *  only one of them asserts stays in that form's own file. */
export function describe_lead_form(
  Component: ComponentType<ILeadFormProps>,
  c: ILeadFormCase
) {
  const mount = (props: ILeadFormProps = {}) => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => <Component {...props} />,
        action: async () => null,
        HydrateFallback: () => null,
      },
    ]);
    return render(
      <Stub initialEntries={["/"]} future={{ v8_middleware: true }} />
    );
  };

  describe("lead form contract", () => {
    test("renders a message per field it came back marked with", async () => {
      const screen = await mount({ errors: c.errors });

      for (const msg of Object.values(c.errors)) {
        await expect
          .element(screen.getByText(msg, { exact: true }))
          .toBeVisible();
      }
    });

    test("focus lands on the first field a failed submit marked", async () => {
      const screen = await mount({ errors: c.errors });

      // the first marked field in ask order, not the submit button the round
      // trip came from
      await expect.element(c.first_marked(screen)).toHaveFocus();
    });

    test("a failed submit repopulates the typed values", async () => {
      const screen = await mount({
        values: c.values,
        errors: { email: "That domain doesn't resolve" },
      });

      await expect
        .element(screen.getByLabelText(c.name_label))
        .toHaveValue(c.values.o_name);
      await expect
        .element(screen.getByLabelText(c.email_label))
        .toHaveValue(c.values.email);
    });

    test("a session mismatch takes focus and marks no field", async () => {
      const screen = await mount({
        signed_in_as: "jane@acme.org",
        errors: {},
      });

      // the remedy is two actions; focus goes to it or the user never finds it
      const notice = screen
        .getByText(/this browser is signed in as/i)
        .element()
        .closest("[role=alert]");
      expect(notice).toHaveFocus();
      expect(notice).toMatchTextContent("jane@acme.org");

      await expect
        .element(screen.getByLabelText(c.name_label))
        .not.toHaveAttribute("aria-invalid", "true");
    });

    test("a form-level message is announced above the submit and takes focus", async () => {
      const msg =
        "Too many submissions from this network. Try again in an hour.";
      const screen = await mount({
        values: c.values,
        errors: {},
        message: msg,
      });

      const alert = screen.getByRole("alert");
      await expect.element(alert).toHaveTextContent(msg);
      await expect.element(alert).toHaveFocus();

      // above the button just pressed, so the reason sits where the eye is
      const submit = screen.getByRole("button", { name: c.submit_label });
      expect(
        alert.element().compareDocumentPosition(submit.element()) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      await expect
        .element(screen.getByLabelText(c.name_label))
        .toHaveValue(c.values.o_name);
    });

    test("no message, no alert", async () => {
      const screen = await mount({ values: c.values, errors: {} });

      await expect.element(screen.getByLabelText(c.name_label)).toBeVisible();
      expect(screen.getByRole("alert").query()).toBeNull();
    });

    test("pending reports on the button and locks the fields", async () => {
      const screen = await mount({ pending: true });

      const btn = screen.getByRole("button", { name: /submitting/i });
      await expect.element(btn).toBeVisible();
      await expect.element(btn).toBeDisabled();
      await expect.element(screen.getByLabelText(c.name_label)).toBeDisabled();
      await expect.element(screen.getByLabelText(c.email_label)).toBeDisabled();
    });
  });
}
