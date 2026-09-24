import { AskHost } from "@better-giving/ui";
import { delay, HttpResponse, http } from "msw";
import { createRoutesStub } from "react-router";
import { describe, expect, onTestFinished, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { mswWorker } from "#/setup-tests-browser";
import type {
  CreateRecipientRequest,
  Group,
  ValidationContent,
} from "#/types/bank-details";
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
  field({
    key: "dateOfBirth",
    name: "Date of birth",
    example: "1990-01-31",
    type: "date",
  }),
];

function FormButtons({ disabled }: FormButtonsProps) {
  return (
    <button type="submit" disabled={disabled}>
      Continue
    </button>
  );
}

type Refusal = ValidationContent["errors"][number];

const not_valid = (path: string): Refusal => ({
  code: "NOT_VALID",
  path,
  message: `invalid ${path}`,
  arguments: [],
});

/** answers the create call with a 422 carrying `errors`; the delay keeps the request in flight long enough to act during it */
function refuse_with(...errors: Refusal[]) {
  mswWorker.use(
    http.post("/api/wise/v1/accounts", async () => {
      await delay(200);
      const content: ValidationContent = {
        timestamp: "2026-09-24T00:00:00Z",
        errors,
      };
      return HttpResponse.json(content, { status: 422 });
    })
  );
}

const refuse = (...paths: string[]) => refuse_with(...paths.map(not_valid));

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
  onTestFinished(() => document.removeEventListener("focusin", on_focusin));
  return {
    // outlasts anything still queued to move focus after the submit settles
    async settle() {
      await new Promise((r) => setTimeout(r, 100));
      document.removeEventListener("focusin", on_focusin);
      return focused;
    },
  };
}

/** the refusal prompt mounts at `AskHost`, and `Prompt` reads the router */
async function render_form(form_fields: Group[] = fields) {
  const on_submit = vi.fn();
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <>
          <RecipientDetailsForm
            fields={form_fields}
            currency="GBP"
            amount={0}
            type="sort_code"
            quoteId="quote-1"
            FormButtons={FormButtons}
            onSubmit={on_submit}
          />
          <button type="button">Elsewhere</button>
          <AskHost />
        </>
      ),
    },
  ]);
  const screen = await render(<Stub />);
  return { screen, on_submit };
}

async function fill_all(
  screen: Awaited<ReturnType<typeof render_form>>["screen"]
) {
  await screen.getByLabelText("Account holder").fill("Jane Doe");
  await screen.getByLabelText("Sort code").fill("00-00-00");
  await screen.getByLabelText("Account number").fill("00000000");
}

describe("RecipientDetailsForm", () => {
  test("a server refusal lands focus on the first field it names, without handing it back to the submit button first", async () => {
    refuse("sortCode", "accountNumber");
    const { screen, on_submit } = await render_form();
    await fill_all(screen);

    const focus = record_focus();
    await screen.getByRole("button", { name: "Continue" }).click();

    const sort_code = screen.getByLabelText("Sort code");
    await expect.element(sort_code).toHaveFocus();
    await expect.element(sort_code).toHaveAttribute("aria-invalid", "true");
    await expect
      .element(sort_code)
      .toHaveAccessibleDescription("invalid sortCode");
    await expect
      .element(screen.getByLabelText("Account number"))
      .toHaveAccessibleDescription("invalid accountNumber");
    await expect
      .element(screen.getByLabelText("Account holder"))
      .not.toHaveAttribute("aria-describedby");

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

    const trigger = screen.getByRole("combobox", { name: "Account type" });
    await expect.element(trigger).toHaveFocus();
    await expect.element(trigger).toHaveAttribute("aria-invalid", "true");
    await expect
      .element(trigger)
      .toHaveAccessibleDescription("invalid accountType");
    expect(screen.getByText("invalid accountType").elements()).toHaveLength(1);
    expect(await focus.settle()).toEqual(["Continue", "combobox"]);
  });

  test("a refusal naming a date field lands focus on it, described by Wise's message", async () => {
    refuse("dateOfBirth");
    const { screen } = await render_form();
    await fill_all(screen);

    await screen.getByRole("button", { name: "Continue" }).click();

    const dob = screen.getByLabelText("Date of birth");
    await expect.element(dob).toHaveFocus();
    await expect.element(dob).toHaveAttribute("aria-invalid", "true");
    await expect
      .element(dob)
      .toHaveAccessibleDescription("invalid dateOfBirth");
    await expect
      .element(screen.getByLabelText("Sort code"))
      .not.toHaveAttribute("aria-describedby");
  });

  test("a required field left empty takes focus without handing it back to the submit button first", async () => {
    const { screen, on_submit } = await render_form(
      fields.map((f) =>
        f.key === "sortCode" || f.key === "accountNumber"
          ? { ...f, required: true }
          : f
      )
    );

    const focus = record_focus();
    await screen.getByRole("button", { name: "Continue" }).click();

    const sort_code = screen.getByLabelText("Sort code");
    await expect.element(sort_code).toHaveFocus();
    await expect.element(sort_code).toHaveAttribute("aria-invalid", "true");
    expect(await focus.settle()).toEqual(["Continue", "sortCode"]);
    await expect.element(sort_code).toHaveFocus();
    expect(on_submit).not.toHaveBeenCalled();
  });

  test("a refusal whose first path has no field on screen lands focus on the first one that does", async () => {
    refuse("iban", "accountNumber");
    const { screen } = await render_form();
    await fill_all(screen);

    const focus = record_focus();
    await screen.getByRole("button", { name: "Continue" }).click();

    const account_number = screen.getByLabelText("Account number");
    await expect.element(account_number).toHaveFocus();
    await expect
      .element(screen.getByText("invalid accountNumber"))
      .toBeVisible();
    expect(await focus.settle()).toEqual(["Continue", "accountNumber"]);
  });

  test("a refusal naming a field on screen and a path with none marks the field and shows the other message above the buttons, until the next submit", async () => {
    refuse("sortCode", "iban");
    const { screen } = await render_form();
    await fill_all(screen);

    const focus = record_focus();
    const alert = screen.getByRole("alert");
    await expect.element(alert).not.toMatchTextContent("invalid iban");
    await screen.getByRole("button", { name: "Continue" }).click();

    const sort_code = screen.getByLabelText("Sort code");
    await expect.element(sort_code).toHaveFocus();
    await expect
      .element(sort_code)
      .toHaveAccessibleDescription("invalid sortCode");
    await expect.element(alert).toMatchTextContent("invalid iban");
    await expect.element(screen.getByText("invalid iban")).toBeVisible();
    expect(await focus.settle()).toEqual(["Continue", "sortCode"]);
    expect(screen.getByRole("dialog").query()).toBeNull();

    // the same answer again, so only a clear at submit can empty the block
    refuse("sortCode", "iban");
    await screen.getByRole("button", { name: "Continue" }).click();
    await expect.element(alert).not.toMatchTextContent("invalid iban");
    await expect.element(alert).toMatchTextContent("invalid iban");
  });

  test("a refusal pairing a field's NOT_VALID with another code shows the other code's message too", async () => {
    refuse_with(not_valid("sortCode"), {
      code: "NOT_UNIQUE",
      path: "accountNumber",
      message: "This account is already registered",
      arguments: [],
    });
    const { screen } = await render_form();
    await fill_all(screen);

    await screen.getByRole("button", { name: "Continue" }).click();

    await expect
      .element(screen.getByLabelText("Sort code"))
      .toHaveAccessibleDescription("invalid sortCode");
    await expect
      .element(screen.getByRole("alert"))
      .toMatchTextContent("This account is already registered");
    await expect
      .element(screen.getByText("This account is already registered"))
      .toBeVisible();
  });

  test("a refusal naming no field on screen shows its message in a prompt, and the next submit goes through", async () => {
    refuse("iban");
    const { screen, on_submit } = await render_form();
    await fill_all(screen);

    const focus = record_focus();
    await screen.getByRole("button", { name: "Continue" }).click();

    const dialog = screen.getByRole("dialog");
    await expect.element(dialog).toMatchTextContent("invalid iban");
    const names = fields.map((f) => f.key).concat("combobox");
    expect((await focus.settle()).filter((n) => names.includes(n))).toEqual([]);

    (
      screen.getByRole("button", { name: "Ok" }).element() as HTMLElement
    ).click();
    await expect.element(dialog).not.toBeInTheDocument();

    mswWorker.use(
      http.post("/api/wise/v1/accounts", () => HttpResponse.json({ id: 1 }))
    );
    await screen.getByRole("button", { name: "Continue" }).click();
    await vi.waitFor(() => expect(on_submit).toHaveBeenCalledOnce());
  });

  test("a refusal listing fields out of screen order lands focus on the one highest on screen", async () => {
    refuse("accountNumber", "sortCode");
    const { screen } = await render_form();
    await fill_all(screen);

    const focus = record_focus();
    await screen.getByRole("button", { name: "Continue" }).click();

    const sort_code = screen.getByLabelText("Sort code");
    await expect.element(sort_code).toHaveFocus();
    expect(await focus.settle()).toEqual(["Continue", "sortCode"]);
  });

  test("focus the user moved outside the form during the request stays where they put it", async () => {
    refuse("sortCode");
    const { screen } = await render_form();
    await fill_all(screen);

    const focus = record_focus();
    await screen.getByRole("button", { name: "Continue" }).click();
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    await elsewhere.click();

    await expect.element(screen.getByText("invalid sortCode")).toBeVisible();
    expect(await focus.settle()).toEqual(["Continue", "Elsewhere"]);
    await expect.element(elsewhere).toHaveFocus();
  });

  test("each field is filled through its label, and those values are what gets submitted", async () => {
    let sent: CreateRecipientRequest | undefined;
    mswWorker.use(
      http.post("/api/wise/v1/accounts", async ({ request }) => {
        sent = (await request.json()) as CreateRecipientRequest;
        return HttpResponse.json({ id: 1 });
      })
    );
    const { screen, on_submit } = await render_form();

    await screen.getByLabelText("Account holder").fill("Jane Doe");
    await screen.getByLabelText("Sort code").fill("40-30-20");
    await screen.getByLabelText("Account number").fill("12345678");
    await screen.getByLabelText("Date of birth").fill("1990-01-31");

    const trigger = screen.getByRole("combobox", { name: "Account type" });
    // the select's own label names it, with no second one beside it
    const cell = (trigger.element() as HTMLElement).closest(
      '[data-scope="select"][data-part="root"]'
    )?.parentElement;
    const shown_labels = [...(cell?.querySelectorAll("label") ?? [])].filter(
      (l) => l.checkVisibility()
    );
    expect(shown_labels.map((l) => l.textContent)).toEqual(["Account type"]);

    await trigger.click();
    await screen.getByRole("option", { name: "Savings" }).click();
    await screen.getByRole("button", { name: "Continue" }).click();

    await vi.waitFor(() => expect(on_submit).toHaveBeenCalledOnce());
    expect(sent).toMatchObject({
      accountHolderName: "Jane Doe",
      details: {
        accountType: "SAVINGS",
        sortCode: "40-30-20",
        accountNumber: "12345678",
        dateOfBirth: "1990-01-31",
      },
    });
  });

  test("a required field keeps its marker, and submitting it empty marks it invalid", async () => {
    const { screen } = await render_form(
      fields.map((f) => ({ ...f, required: true }))
    );

    for (const f of fields) {
      const label = screen.getByText(f.name, { exact: true }).element();
      expect(getComputedStyle(label, "::after").content, f.name).toBe('" *"');
    }

    await screen.getByRole("button", { name: "Continue" }).click();

    await expect.element(screen.getByLabelText("Account holder")).toHaveFocus();
    const trigger = screen.getByRole("combobox", { name: "Account type" });
    await expect.element(trigger).toHaveAttribute("aria-invalid", "true");
    await expect.element(trigger).toHaveAttribute("aria-required", "true");
    await expect
      .element(screen.getByLabelText("Date of birth"))
      .toHaveAttribute("aria-invalid", "true");
  });
});
