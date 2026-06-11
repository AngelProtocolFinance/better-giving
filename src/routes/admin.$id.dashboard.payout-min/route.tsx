import { Dialog } from "@base-ui/react/dialog";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { useForm } from "react-hook-form";
import { useFetcher, useNavigate, useSearchParams } from "react-router";
import * as v from "valibot";
import { Field } from "#/components/form";
import { endowUpdate } from "#/pages/admin/endow-update-action";
import { search } from "@/helpers/https";
import type { INpoUpdate } from "@/npo";
import { min_payout_amount } from "@/npo/schema";

interface IContent {
  prev: number;
}

export { ErrorModal as ErrorBoundary } from "#/components/error";
export const action = endowUpdate({ redirect: ".." });

export const amount = v.pipe(
  v.string(),
  v.transform((x) => +x),
  v.minValue(min_payout_amount, (x) => `minimum is $${x.requirement}`),
  v.transform((x) => x.toString())
);

export default function PayoutMin() {
  const [params] = useSearchParams();
  const { min = min_payout_amount } = search(params);
  const navigate = useNavigate();

  return (
    <Dialog.Root
      open={true}
      onOpenChange={(open) => {
        if (!open) navigate("..", { replace: true, preventScrollReset: true });
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-fg/30 z-50" />
        <Content prev={+min} />
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Content(props: IContent) {
  const fetcher = useFetcher();

  const {
    handleSubmit,
    register,
    formState: { errors, isDirty },
  } = useForm({
    defaultValues: { amount: props.prev.toString() || "" },
    resolver: valibotResolver(v.object({ amount })),
  });

  return (
    <Dialog.Popup
      render={
        <form
          onSubmit={handleSubmit(async ({ amount }) => {
            fetcher.submit({ payout_minimum: +amount } satisfies INpoUpdate, {
              method: "PATCH",
              encType: "application/json",
            });
          })}
        />
      }
      className="z-50 fixed-center grid bg-popover text-popover-fg sm:w-full w-[90vw] sm:max-w-lg rounded p-6"
    >
      <h4 className="mb-2">Payout threshold</h4>

      <Field
        sub="Grant amount to accumulate to trigger payout"
        required
        label="Amount"
        placeholder="e.g. $100"
        {...register("amount")}
        error={errors.amount?.message}
        classes="mb-4"
      />

      <button
        type="submit"
        disabled={fetcher.state !== "idle" || !isDirty}
        className="text-sm btn-primary rounded px-4 py-2 font-bold"
      >
        {fetcher.state !== "idle" ? "Submitting..." : "Submit"}
      </button>
    </Dialog.Popup>
  );
}
