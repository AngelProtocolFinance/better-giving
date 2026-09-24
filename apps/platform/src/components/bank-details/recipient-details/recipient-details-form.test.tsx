import { delay, HttpResponse, http } from "msw";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { mswWorker } from "#/setup-tests-browser";
import type { Group, ValidationContent } from "#/types/bank-details";
import type { FormButtonsProps } from "../types";
import { RecipientDetailsForm } from "./recipient-details-form";

const field = (o: Pick<Group, "key" | "name" | "example"> & Partial<Group>) =>
  ({
    type: "text",
    refreshRequirementsOnChange: false,
    required: false,
    displayFormat: null,
    minLength: null,
    maxLength: null,
    validationRegexp: null,
    validationAsync: null,
    valuesAllowed: null,
    ...o,
  }) satisfies Group;

const fields = [
  field({
    key: "accountHolderName",
    name: "Account holder",
    example: "Jane Doe",
  }),
  field({
    key: "accountType",
    name: "Account type",
    example: "",
    type: "select",
    valuesAllowed: [
      { key: "CHECKING", name: "Checking" },
      { key: "SAVINGS", name: "Savings" },
    ],
  }),
  field({ key: "sortCode", name: "Sort code", example: "40-30-20" }),
  field({ key: "accountNumber", name: "Account number", example: "12345678" }),
];

function FormButtons({ disabled }: FormButtonsProps) {
  return (
    <button type="submit" disabled={disabled}>
      Continue
    </button>
  );
}

/** answers the create call with a 422 naming `paths`, after a round trip longer than 50ms */
function refuse(...paths: string[]) {
  mswWorker.use(
    http.post("/api/wise/v1/accounts", async () => {
      await delay(200);
      const content: ValidationContent = {
        timestamp: "2026-09-24T00:00:00Z",
        errors: paths.map((path) => ({
          code: "NOT_VALID",
          path,
          message: `invalid ${path}`,
          arguments: [],
        })),
      };
      return HttpResponse.json(content, { status: 422 });
    })
  );
}

function record_focus() {
  const focused: string[] = [];
  const on_focusin = (e: FocusEvent) => {
    const el = e.target as HTMLElement;
    focused.push(
      el.getAttribute("name") ??
        el.getAttribute("role") ??
        el.textContent ??
        el.tagName
    );
  };
  document.addEventListener("focusin", on_focusin);
  return {
    // outlasts anything still queued to move focus after the submit settles
    async settle() {
      await new Promise((r) => setTimeout(r, 100));
      document.removeEventListener("focusin", on_focusin);
      return focused;
    },
  };
}

async function render_form() {
  const on_submit = vi.fn();
  const screen = await render(
    <RecipientDetailsForm
      fields={fields}
      currency="GBP"
      amount={0}
      type="sort_code"
      quoteId="quote-1"
      FormButtons={FormButtons}
      onSubmit={on_submit}
    />
  );
  return { screen, on_submit };
}

describe("RecipientDetailsForm", () => {
  test("a server refusal lands focus on the first field it names, without handing it back to the submit button first", async () => {
    refuse("sortCode", "accountNumber");
    const { screen, on_submit } = await render_form();

    await screen.getByPlaceholder("Jane Doe").fill("Jane Doe");
    await screen.getByPlaceholder("40-30-20").fill("00-00-00");
    await screen.getByPlaceholder("12345678").fill("00000000");

    const focus = record_focus();
    await screen.getByRole("button", { name: "Continue" }).click();

    const sort_code = screen.getByPlaceholder("40-30-20");
    await expect.element(sort_code).toHaveFocus();
    await expect.element(sort_code).toHaveAttribute("aria-invalid", "true");
    await expect.element(screen.getByText("invalid sortCode")).toBeVisible();
    await expect
      .element(screen.getByText("invalid accountNumber"))
      .toBeVisible();

    // the click focuses the button once; a second entry is the fieldset
    // handing focus back, announced before the field takes it
    expect(await focus.settle()).toEqual(["Continue", "sortCode"]);
    await expect.element(sort_code).toHaveFocus();
    expect(on_submit).not.toHaveBeenCalled();
  });

  test("a refusal naming a select lands focus on its trigger", async () => {
    refuse("accountType");
    const { screen } = await render_form();

    const focus = record_focus();
    await screen.getByRole("button", { name: "Continue" }).click();

    const trigger = screen.getByRole("combobox");
    await expect.element(trigger).toHaveFocus();
    await expect.element(screen.getByText("invalid accountType")).toBeVisible();
    expect(await focus.settle()).toEqual(["Continue", "combobox"]);
  });
});
