import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { ChevronRight, CircleAlert, X } from "lucide-react";
import type { PropsWithChildren } from "react";
import { useForm } from "react-hook-form";
import {
  Link,
  useFetcher,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { nonEmpty, object, pipe, string, trim } from "valibot";
import { Field } from "#/components/form";

function Content() {
  const { verdict } = useParams();
  const [params] = useSearchParams();
  const orgName = params.get("org_name") ?? "";

  const fetcher = useFetcher({ key: "application-review" });

  const {
    register,
    formState: { errors },
    handleSubmit,
  } = useForm({
    resolver: valibotResolver(
      object({
        reason:
          verdict === "approved"
            ? pipe(string(), trim())
            : pipe(string(), trim(), nonEmpty("required")),
      })
    ),
    defaultValues: { reason: "" },
  });

  return (
    <Dialog.Content asChild>
      <form
        onSubmit={handleSubmit((fv) =>
          fetcher.submit(fv, {
            encType: "application/json",
            method: "POST",
            action: ".",
          })
        )}
        className="z-50 fixed-center grid content-start justify-items-center bg-popover sm:w-full w-[90vw] sm:max-w-lg rounded overflow-hidden"
      >
        <div className="relative w-full">
          <p className="sm:text-xl font-bold text-center border-b bg-muted p-5">
            Changing Application Status
          </p>
          <Link
            aria-disabled={fetcher.state !== "idle"}
            preventScrollReset
            replace
            to=".."
            className="border p-2 rounded absolute top-1/2 right-4 transform -translate-y-1/2 disabled:text-muted-fg"
          >
            <X className="size-4.5 sm:size-6" />
          </Link>
        </div>
        <CircleAlert size={80} className="my-6 text-destructive" />

        <h3 className="text-center text-2xl mb-2 leading-tight px-3 sm:px-8">
          <div className="uppercase">{verdict}</div>
          <div>Nonprofit</div>
        </h3>

        <p className="px-6 pb-4 text-center text-muted-fg mt-4">
          <span className="block">
            You are about to {verdict} the Application for
          </span>
          <span className="font-semibold block">{orgName}</span>
        </p>

        {verdict === "approved" ? (
          <div className="px-6 pb-4 text-center text-muted-fg">
            This will immediately payout all pending funds to newly linked bank
            account and is irreversible.
          </div>
        ) : null}

        <div className="px-6 pb-4 text-center text-muted-fg font-bold">
          Please ensure you have confirmed all submitted details and supporting
          documentation before proceeding!
        </div>

        <div className="flex items-center gap-2 mb-6">
          <Status classes="bg-muted-fg">Pending</Status>
          <ChevronRight size={20} />
          {verdict === "approved" ? (
            <Status classes="bg-success">Approved</Status>
          ) : (
            <Status classes="bg-destructive">Rejected</Status>
          )}
        </div>

        {verdict === "rejected" && (
          <div className="px-6 w-full pb-6">
            <Field
              {...register("reason")}
              error={errors.reason?.message}
              required
              type="textarea"
              label="Reason for rejection:"
            />
          </div>
        )}

        <div className="p-3 sm:px-8 sm:py-4 flex items-center justify-end gap-4 w-full text-center sm:text-right bg-muted border-t">
          <Link
            to={".."}
            aria-disabled={fetcher.state === "submitting"}
            type="button"
            className="btn-secondary btn text-sm px-8 py-2"
            preventScrollReset
            replace
          >
            Cancel
          </Link>
          <button
            disabled={fetcher.state !== "idle"}
            type="submit"
            className="btn btn-primary px-8 py-2 text-sm"
          >
            Submit
          </button>
        </div>
      </form>
    </Dialog.Content>
  );
}

export default function Prompt() {
  const navigate = useNavigate();
  return (
    <Dialog.Root
      open={true}
      onOpenChange={(e) => {
        if (!e.open)
          navigate("..", { preventScrollReset: true, replace: true });
      }}
    >
      <Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-fg/30 z-50" />
        <Dialog.Positioner className="contents">
          <Content />
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function Status(props: PropsWithChildren<{ classes?: string }>) {
  return (
    <div
      className={`${
        props.classes ?? ""
      } text-primary-fg px-2 py-1 text-xs uppercase rounded`}
    >
      {props.children}
    </div>
  );
}
