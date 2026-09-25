import { AskHost } from "@better-giving/ui";
import { HttpResponse, http } from "msw";
import { createRoutesStub } from "react-router";
import { SWRConfig } from "swr";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { mswWorker } from "#/setup-tests-browser";
import type { AccountRequirements, Group } from "#/types/bank-details";
import { RecipientDetails } from "./recipient-details";

const requirement = (
  type: string,
  title: string,
  group: Group[] = []
): AccountRequirements => ({
  type,
  title,
  usageInfo: null,
  fields: [{ name: title, group }],
});

const local = requirement("sort_code", "Local bank account");

function quote_answers(requirements: AccountRequirements[]) {
  mswWorker.use(
    http.post("/api/wise/v3/profiles/:profile/quotes", () =>
      HttpResponse.json({ id: "quote-1" })
    ),
    http.get("/api/wise/v1/quotes/:quote/account-requirements", () =>
      HttpResponse.json(requirements)
    )
  );
}

/** a fresh swr cache per render: the requirements key is the same in every test */
async function render_details() {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <SWRConfig value={{ provider: () => new Map() }}>
          <RecipientDetails
            disabled={false}
            currency="GBP"
            amount={100}
            FormButtons={() => null}
            onSubmit={async () => {}}
          />
          <AskHost />
        </SWRConfig>
      ),
    },
  ]);
  return render(<Stub />);
}

describe("RecipientDetails", () => {
  test("the transfer type picker is named by its one label and says it is required", async () => {
    quote_answers([local, requirement("iban", "IBAN")]);
    const screen = await render_details();

    const trigger = screen.getByRole("combobox", { name: "Transfer type" });
    await expect.element(trigger).toHaveAttribute("aria-required", "true");
    await expect.element(trigger).toMatchTextContent("Local bank account");
    expect(
      screen.getByText("Transfer type", { exact: true }).elements()
    ).toHaveLength(1);
  });

  test("requirements that shrink below the picked transfer type fall back to the first, in the picker and the form alike", async () => {
    const legal_type: Group = {
      key: "legalType",
      name: "Recipient type",
      type: "radio",
      refreshRequirementsOnChange: true,
      required: false,
      displayFormat: null,
      example: "",
      minLength: null,
      maxLength: null,
      validationRegexp: null,
      validationAsync: null,
      valuesAllowed: [
        { key: "PRIVATE", name: "Person" },
        { key: "BUSINESS", name: "Business" },
      ],
    };
    quote_answers([local, requirement("iban", "IBAN", [legal_type])]);
    mswWorker.use(
      http.post("/api/wise/v1/quotes/:quote/account-requirements", () =>
        HttpResponse.json([local])
      )
    );
    const screen = await render_details();

    const trigger = screen.getByRole("combobox", { name: "Transfer type" });
    await trigger.click();
    await screen.getByRole("option", { name: "IBAN" }).click();
    // the refresh this field asks for answers with the first type alone
    await screen.getByText("Business", { exact: true }).click();

    await expect
      .element(screen.getByText("Business", { exact: true }))
      .not.toBeInTheDocument();
    await expect.element(trigger).toMatchTextContent("Local bank account");
  });
});
