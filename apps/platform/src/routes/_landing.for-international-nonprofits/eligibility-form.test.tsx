import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { ILeadValues } from "@/reg/lead";
import { EligibilityForm, type IEligibilityErrors } from "./eligibility-form";

interface Opts {
  errors?: IEligibilityErrors;
  values?: ILeadValues;
  signed_in_as?: string;
  pending?: boolean;
  action?: (fd: FormData) => void;
}

/** the action echoes every posted name; this page leaves o_ein empty */
const posted = (over: Partial<ILeadValues> = {}): ILeadValues => ({
  o_name: "Yamba Loves Uganda",
  o_ein: "",
  o_hq_country: "Uganda",
  o_registration_number: "1234567",
  email: "hello@yamba.org",
  ...over,
});

function stub(opts: Opts = {}) {
  return createRoutesStub([
    {
      path: "/",
      Component: () => (
        <EligibilityForm
          errors={opts.errors}
          values={opts.values}
          signed_in_as={opts.signed_in_as}
          pending={opts.pending}
        />
      ),
      action: async ({ request }) => {
        opts.action?.(await request.formData());
        return null;
      },
      HydrateFallback: () => null,
    },
  ]);
}

const mount = (opts: Opts = {}) => {
  const Stub = stub(opts);
  return render(
    <Stub initialEntries={["/"]} future={{ v8_middleware: true }} />
  );
};

describe("EligibilityForm", () => {
  test("renders each field's error and focuses the first one that failed", async () => {
    const screen = await mount({
      errors: {
        o_hq_country: "Select a country",
        o_registration_number: "Required",
        email: "Enter a valid email",
      },
    });

    await expect.element(screen.getByText("Select a country")).toBeVisible();
    await expect.element(screen.getByText("Required")).toBeVisible();
    await expect.element(screen.getByText("Enter a valid email")).toBeVisible();

    // country is the first failing field in ask order, so focus lands there
    // rather than staying on the submit button the round trip came from
    await expect
      .element(
        screen.getByRole("combobox", { name: /country of registration/i })
      )
      .toHaveFocus();
  });

  test("an org-name error outranks the later ones for focus", async () => {
    const screen = await mount({
      errors: { o_name: "Required", email: "Enter a valid email" },
    });

    await expect
      .element(screen.getByLabelText(/organization name/i))
      .toHaveFocus();
  });

  test("empty required fields block the submit", async () => {
    const action = vi.fn();
    const screen = await mount({ action });

    await screen.getByRole("button", { name: "Unlock U.S. donors" }).click();

    expect(action).not.toHaveBeenCalled();
    expect(
      screen.getByLabelText(/organization name/i).element()
    ).toHaveAttribute("required");
  });

  test("posts the picked country plus the hidden org type, honeypot empty", async () => {
    const action = vi.fn();
    const screen = await mount({ action });

    await screen
      .getByLabelText(/organization name/i)
      .fill("Yamba Loves Uganda");
    await screen
      .getByRole("combobox", { name: /country of registration/i })
      .fill("Ugan");
    await screen.getByRole("option", { name: /Uganda/ }).click();
    await screen.getByLabelText(/registration number/i).fill("1234567");
    await screen.getByLabelText(/work email/i).fill("hello@yamba.org");

    await screen.getByRole("button", { name: "Unlock U.S. donors" }).click();

    await vi.waitFor(() => expect(action).toHaveBeenCalled());
    const fd = action.mock.calls[0]![0] as FormData;
    expect(fd.get("o_name")).toBe("Yamba Loves Uganda");
    expect(fd.get("o_hq_country")).toBe("Uganda");
    expect(fd.get("o_registration_number")).toBe("1234567");
    expect(fd.get("email")).toBe("hello@yamba.org");
    expect(fd.get("o_type")).toBe("other");
    expect(fd.get("middle_name")).toBe("");
  });

  test("a failed submit repopulates every field it came back with", async () => {
    const screen = await mount({
      values: posted(),
      errors: { email: "That domain doesn't resolve" },
    });

    await expect
      .element(screen.getByLabelText(/organization name/i))
      .toHaveValue("Yamba Loves Uganda");
    await expect
      .element(screen.getByLabelText(/registration number/i))
      .toHaveValue("1234567");
    await expect
      .element(screen.getByLabelText(/work email/i))
      .toHaveValue("hello@yamba.org");
    // the combobox is the field most able to lose a selection silently: it is
    // controlled, so nothing in the markup carries it back on its own
    await expect
      .element(
        screen.getByRole("combobox", { name: /country of registration/i })
      )
      .toHaveValue("Uganda");
  });

  test("the repopulated country is what posts, untouched", async () => {
    const action = vi.fn();
    const screen = await mount({
      values: posted(),
      errors: { email: "That domain doesn't resolve" },
      action,
    });

    await screen.getByLabelText(/work email/i).fill("hello@yamba.org");
    await screen.getByRole("button", { name: "Unlock U.S. donors" }).click();

    await vi.waitFor(() => expect(action).toHaveBeenCalled());
    expect((action.mock.calls[0]![0] as FormData).get("o_hq_country")).toBe(
      "Uganda"
    );
  });

  test("a session mismatch takes focus and marks no field", async () => {
    const screen = await mount({
      signed_in_as: "jane@acme.org",
      errors: {},
    });

    const notice = screen
      .getByText(/this browser is signed in as/i)
      .element()
      .closest("[role=alert]");
    // the remedy is two actions; focus goes to it or the user never finds it
    expect(notice).toHaveFocus();
    expect(notice).toHaveTextContent("jane@acme.org");

    await expect
      .element(screen.getByLabelText(/organization name/i))
      .not.toHaveAttribute("aria-invalid", "true");
    await expect
      .element(
        screen.getByRole("link", { name: /continue with this account/i })
      )
      .toBeVisible();
  });

  test("pending reports on the button and locks the fields", async () => {
    const screen = await mount({ pending: true });

    const btn = screen.getByRole("button", { name: /submitting/i });
    await expect.element(btn).toBeVisible();
    expect(btn.element()).toBeDisabled();
    expect(screen.getByLabelText(/work email/i).element()).toBeDisabled();
  });
});
