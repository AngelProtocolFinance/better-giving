import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { BankDetails } from "#/components/bank-details";
import { type IPrompt, Prompt } from "#/components/prompt";
import { FormButtons } from "./form-buttons";

export { ErrorBoundary } from "#/components/error";
export { action } from "./api";

export default function Payout() {
  const fetcher = useFetcher();
  const [prompt, setPrompt] = useState<IPrompt>();

  return (
    <div className="px-6 py-4 md:px-10 md:py-8">
      <Link
        to={"../referrals"}
        className="flex items-center gap-1 mb-4 text-primary hover:text-primary/80 text-sm"
      >
        <ChevronLeft size={18} />
        <span>Back</span>
      </Link>
      <BankDetails
        FormButtons={FormButtons}
        onSubmit={async ({ id }) =>
          fetcher.submit(id.toString(), {
            method: "POST",
            encType: "text/plain",
          })
        }
        is_loading={fetcher.state !== "idle"}
      />
      {prompt && <Prompt {...prompt} onClose={() => setPrompt(undefined)} />}
    </div>
  );
}
