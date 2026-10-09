import type { Fetcher } from "swr";
import use_swr from "swr/immutable";
import { report_degraded_null } from "#/errors/report";
import type {
  AccountRequirements,
  CreateRecipientRequest,
  Quote,
} from "#/types/bank-details";
import { json_ok } from "@/helpers/https";

interface Input {
  amount: number;
  currency: string;
}
interface RequirementsOutput {
  requirements: AccountRequirements[];
  quoteId: string;
}

interface ReqUpdateInput {
  quoteId: string;
  request: CreateRecipientRequest;
  amount: number;
  currency: string;
}

const requirements: Fetcher<RequirementsOutput, Input | null> = async (
  input
) => {
  const quote_payload = {
    sourceCurrency: "USD",
    targetCurrency: input.currency,
    sourceAmount: input.amount,
  };

  const quote = await fetch("/api/wise/v3/profiles/{{profileId}}/quotes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(quote_payload),
  }).then((res) => json_ok<Quote>(res));

  const requirements = await fetch(
    `/api/wise/v1/quotes/${quote.id}/account-requirements`,
    { headers: { "accept-minor-version": "1" } }
  ).then((res) => json_ok<AccountRequirements[]>(res));

  return { requirements, quoteId: quote.id };
};

export function use_requirements(args: Input | null) {
  const req = use_swr(args, requirements);

  async function update_requirements(payload: ReqUpdateInput) {
    // fired from field change/blur handlers nobody awaits: a connection dropped
    // before or during the body would otherwise escape as an unhandled
    // rejection. the form keeps the requirements it already has, same as a
    // non-ok answer.
    const requirements = await fetch(
      `/api/wise/v1/quotes/${payload.quoteId}/account-requirements`,
      {
        headers: {
          "accept-minor-version": "1",
          "content-type": "application/json",
        },
        body: JSON.stringify(payload.request),
        method: "POST",
      }
    )
      .then((res) =>
        res.ok ? (res.json() as Promise<AccountRequirements[]>) : null
      )
      .catch(report_degraded_null);

    if (!requirements) return;

    req.mutate(
      { quoteId: payload.quoteId, requirements },
      { revalidate: false }
    );
  }

  return { req, update_requirements };
}
