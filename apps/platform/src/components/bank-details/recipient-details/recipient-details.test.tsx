import { AskHost } from "@better-giving/ui";
import { HttpResponse, http } from "msw";
import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { mswWorker } from "#/setup-tests-browser";
import type { AccountRequirements } from "#/types/bank-details";
import { RecipientDetails } from "./recipient-details";

const requirement = (type: string, title: string): AccountRequirements => ({
  type,
  title,
  usageInfo: null,
  fields: [],
});

describe("RecipientDetails", () => {
  test("the transfer type picker is named by its one label and says it is required", async () => {
    mswWorker.use(
      http.post("/api/wise/v3/profiles/:profile/quotes", () =>
        HttpResponse.json({ id: "quote-1" })
      ),
      http.get("/api/wise/v1/quotes/:quote/account-requirements", () =>
        HttpResponse.json([
          requirement("sort_code", "Local bank account"),
          requirement("iban", "IBAN"),
        ])
      )
    );
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <>
            <RecipientDetails
              disabled={false}
              currency="GBP"
              amount={100}
              FormButtons={() => null}
              onSubmit={async () => {}}
            />
            <AskHost />
          </>
        ),
      },
    ]);
    const screen = await render(<Stub />);

    const trigger = screen.getByRole("combobox", { name: "Transfer type" });
    await expect.element(trigger).toHaveAttribute("aria-required", "true");
    await expect.element(trigger).toMatchTextContent("Local bank account");
    expect(
      screen.getByText("Transfer type", { exact: true }).elements()
    ).toHaveLength(1);
  });
});
