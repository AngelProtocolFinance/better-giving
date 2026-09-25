import { AskHost } from "@better-giving/ui";
import { HttpResponse, http } from "msw";
import { type ComponentType, useState } from "react";
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
const iban_number: Group = {
  ...legal_type,
  key: "iban",
  name: "IBAN number",
  type: "text",
  refreshRequirementsOnChange: false,
  valuesAllowed: null,
};

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

/** 100 answers `before`; 200 answers `after` once `after_held` settles */
function amount_answers(
  before: AccountRequirements[],
  after: AccountRequirements[],
  after_held: Promise<void> = Promise.resolve()
) {
  mswWorker.use(
    http.post("/api/wise/v3/profiles/:profile/quotes", async ({ request }) => {
      const { sourceAmount } = (await request.json()) as {
        sourceAmount: number;
      };
      return HttpResponse.json({ id: `quote-${sourceAmount}` });
    }),
    http.get(
      "/api/wise/v1/quotes/:quote/account-requirements",
      async ({ params }) => {
        if (params.quote === "quote-100") return HttpResponse.json(before);
        await after_held;
        return HttpResponse.json(after);
      }
    )
  );
}

interface IDetails {
  amount: number;
}

function Details({ amount }: IDetails) {
  return (
    <RecipientDetails
      disabled={false}
      currency="GBP"
      amount={amount}
      FormButtons={() => null}
      onSubmit={async () => {}}
    />
  );
}

/** stands in for bank details' amount field, which re-keys the requirements request */
function AmountChange() {
  const [amount, set_amount] = useState(100);
  return (
    <>
      <button type="button" onClick={() => set_amount(200)}>
        Change amount
      </button>
      <Details amount={amount} />
    </>
  );
}

/** a fresh swr cache per render: the requirements key is the same in every test */
async function render_details(
  Body: ComponentType = () => <Details amount={100} />
) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <SWRConfig value={{ provider: () => new Map() }}>
          <Body />
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

  test("requirements that shrink below the picked transfer type drop the pick for the first, and a refresh restoring it keeps the first until the user picks again", async () => {
    const iban = requirement("iban", "IBAN", [legal_type, iban_number]);
    const sort_code = (title: string) =>
      requirement("sort_code", title, [legal_type]);
    quote_answers([sort_code("Local bank account"), iban]);
    // each radio change refreshes: first down to the first type alone, then
    // back to both, the first under a new title so its arrival is visible
    const refreshes = [
      [sort_code("Local bank account")],
      [sort_code("UK bank account"), iban],
    ];
    mswWorker.use(
      http.post("/api/wise/v1/quotes/:quote/account-requirements", () =>
        HttpResponse.json(refreshes.shift())
      )
    );
    const screen = await render_details();

    const trigger = screen.getByRole("combobox", { name: "Transfer type" });
    await trigger.click();
    await screen.getByRole("option", { name: "IBAN" }).click();
    await expect.element(screen.getByLabelText("IBAN number")).toBeVisible();

    await screen.getByText("Business", { exact: true }).click();
    await expect
      .element(screen.getByLabelText("IBAN number"))
      .not.toBeInTheDocument();
    await expect.element(trigger).toMatchTextContent("Local bank account");

    await screen.getByText("Person", { exact: true }).click();
    await expect.element(trigger).toMatchTextContent("UK bank account");
    expect(screen.getByLabelText("IBAN number").query()).toBeNull();
    expect(refreshes).toEqual([]);
  });

  test("a new amount keeps the picked transfer type through the empty wait for its requirements", async () => {
    const iban = requirement("iban", "IBAN", [iban_number]);
    let answer_new_amount = () => {};
    const new_amount_held = new Promise<void>((resolve) => {
      answer_new_amount = resolve;
    });
    // the first type under a new title, so the list's arrival is visible
    amount_answers(
      [local, iban],
      [requirement("sort_code", "UK bank account"), iban],
      new_amount_held
    );
    const screen = await render_details(AmountChange);

    const trigger = screen.getByRole("combobox", { name: "Transfer type" });
    await trigger.click();
    await screen.getByRole("option", { name: "IBAN" }).click();
    await expect.element(screen.getByLabelText("IBAN number")).toBeVisible();

    await screen.getByRole("button", { name: "Change amount" }).click();
    await expect
      .element(screen.getByText("Loading requirements"))
      .toBeVisible();

    answer_new_amount();
    await expect.element(trigger).toMatchTextContent("IBAN");
    await expect.element(screen.getByLabelText("IBAN number")).toBeVisible();
    await trigger.click();
    await expect
      .element(screen.getByRole("option", { name: "UK bank account" }))
      .toBeVisible();
  });

  test("a new amount that reorders the transfer types keeps the picked type in the picker and the form", async () => {
    const iban = requirement("iban", "IBAN", [iban_number]);
    // the other type under a new title, so the reordered list's arrival is visible
    amount_answers(
      [local, iban],
      [iban, requirement("sort_code", "UK bank account")]
    );
    const screen = await render_details(AmountChange);

    const trigger = screen.getByRole("combobox", { name: "Transfer type" });
    await trigger.click();
    await screen.getByRole("option", { name: "IBAN" }).click();
    await expect.element(screen.getByLabelText("IBAN number")).toBeVisible();

    await screen.getByRole("button", { name: "Change amount" }).click();
    await trigger.click();
    await expect
      .element(screen.getByRole("option", { name: "UK bank account" }))
      .toBeVisible();
    await expect.element(trigger).toMatchTextContent("IBAN");
    await expect.element(screen.getByLabelText("IBAN number")).toBeVisible();
  });

  test("with no pick yet, a new amount that reorders the transfer types shows the new first type", async () => {
    const iban = requirement("iban", "IBAN", [iban_number]);
    amount_answers([local, iban], [iban, local]);
    const screen = await render_details(AmountChange);

    const trigger = screen.getByRole("combobox", { name: "Transfer type" });
    await expect.element(trigger).toMatchTextContent("Local bank account");
    expect(screen.getByLabelText("IBAN number").query()).toBeNull();

    await screen.getByRole("button", { name: "Change amount" }).click();
    await expect.element(trigger).toMatchTextContent("IBAN");
    await expect.element(screen.getByLabelText("IBAN number")).toBeVisible();
  });
});
