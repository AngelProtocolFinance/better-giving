import { Group, type IPrompt, Prompt } from "@better-giving/ui";
import { ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useFetcher, useParams } from "react-router";
import { BankDetails, type OnSubmit } from "#/components/bank-details";
import { submit_error_prompt } from "#/helpers/error-prompt";
import { FormButtons } from "./form-buttons";

export { ErrorBoundary } from "#/components/error";
export { action } from "./api";

export default function Banking() {
  const { id: endowIdParam = "" } = useParams();
  const fetcher = useFetcher();
  const [prompt, setPrompt] = useState<IPrompt>();

  const submit: OnSubmit = async (recipient, bankStatementUrl) => {
    const { id, details, currency } = recipient;
    //creating account return V1Recipient and doesn't have longAccount summary field
    const bankSummary = `${currency.toUpperCase()} account ending in ${
      details.accountNumber?.slice(-4) || "0000"
    } `;

    fetcher.submit(
      {
        wiseRecipientID: id.toString(),
        bankSummary,
        endowmentID: +endowIdParam,
        bankStatementFile: {
          name: bankStatementUrl,
          publicUrl: bankStatementUrl,
        },
      },
      { action: ".", method: "POST", encType: "application/json" }
    );
  };

  // a rejected submit resolves instead of throwing: the action returns a tagged
  // failure (`resp.fail`) the client reads off `fetcher.data`, while a landed
  // one redirects and never lands here.
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data?.message) return;
    setPrompt(
      submit_error_prompt(fetcher.data, {
        context: "submitting banking application",
      })
    );
  }, [fetcher.state, fetcher.data]);

  return (
    <div className="px-6 py-4 md:px-10 md:py-8">
      <Link
        to={"../banking"}
        className="flex items-center gap-1 mb-4 text-primary hover:text-primary/80 text-sm"
      >
        <ChevronLeft size={18} />
        <span>Back</span>
      </Link>
      <Group
        className="max-w-4xl"
        title="Bank account details"
        description="The following information will be used to register your bank account that will be used to withdraw your funds."
      >
        <BankDetails
          verified
          FormButtons={FormButtons}
          onSubmit={submit}
          is_loading={fetcher.state !== "idle"}
        />
      </Group>
      {prompt && <Prompt {...prompt} onClose={() => setPrompt(undefined)} />}
    </div>
  );
}
