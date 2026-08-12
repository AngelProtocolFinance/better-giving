import { valibotResolver } from "@hookform/resolvers/valibot";
import { useFetcher } from "react-router";
import { useRemixForm } from "remix-hook-form";
import { LoadText } from "#/components/load-text";
import type { IRegResumeFv } from "@/reg";
import { reg_resume_fv } from "@/reg/schema";

interface Props {
  /** reference held in the registration cookie, if any */
  prev: string;
  /** carries the current query (referrer=…) through to the index action */
  action: string;
}

export function ResumeStrip({ prev, action }: Props) {
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRemixForm<IRegResumeFv>({
    fetcher,
    resolver: valibotResolver(reg_resume_fv),
    defaultValues: { reference: prev },
    submitData: { intent: "resume" },
    submitConfig: { action, method: "post" },
  });

  return (
    <fetcher.Form
      method="POST"
      onSubmit={handleSubmit}
      className="mt-8 p-4 bg-muted border border-border rounded"
    >
      <p className="text-sm font-bold">Already started an application?</p>
      <div className="flex gap-2 mt-3">
        <input
          {...register("reference")}
          aria-label="Registration reference"
          aria-invalid={!!errors.reference}
          placeholder="Registration reference"
          className="field-input min-w-0 flex-1"
        />
        <button
          type="submit"
          disabled={busy}
          className="btn btn-secondary text-sm whitespace-nowrap"
        >
          <LoadText is_loading={busy} text="Resuming...">
            Resume
          </LoadText>
        </button>
      </div>
      <p className="field-err text-left mt-2 empty:hidden">
        {errors.reference?.message}
      </p>
    </fetcher.Form>
  );
}
