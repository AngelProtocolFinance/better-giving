import { Actions, Field, Modal } from "@better-giving/ui";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import * as v from "valibot";
import { humanize } from "@/helpers/decimal";
import { DialogActions } from "./dialog-actions";
import { RowSummary } from "./row-summary";
import type { IOwedRow } from "./types";
import { use_submit_once } from "./use-submit-once";

export interface IWriteOff {
  reason: string;
}

export interface IWriteOffDialog {
  open: boolean;
  row: IOwedRow | null;
  /** true while the write-off request is in flight: holds the dialog open */
  submitting: boolean;
  /** the refusal the last request came back with */
  error?: string;
  /** set when the write-off went through and the row still owes this much */
  remainder_usd?: number;
  on_submit: (values: IWriteOff) => void;
  on_close: () => void;
  /** see `Modal`'s `returnFocusFallback` */
  return_focus_fallback?: () => HTMLElement | null;
}

const HEADING = "Write off amount owed";

const schema = v.object({
  reason: v.pipe(v.string(), v.trim(), v.nonEmpty("required")),
});

export function WriteOffDialog({
  open,
  row,
  submitting,
  on_close,
  return_focus_fallback,
  ...rest
}: IWriteOffDialog) {
  return (
    <Modal
      open={open}
      onClose={on_close}
      busy={submitting}
      returnFocusFallback={return_focus_fallback}
      classes="bg-panel"
    >
      {row &&
        (rest.remainder_usd != null ? (
          <Remainder usd={rest.remainder_usd} on_close={on_close} />
        ) : (
          <Body
            key={row.id}
            row={row}
            submitting={submitting}
            on_close={on_close}
            error={rest.error}
            on_submit={rest.on_submit}
          />
        ))}
    </Modal>
  );
}

interface IBody
  extends Pick<
    IWriteOffDialog,
    "submitting" | "error" | "on_submit" | "on_close"
  > {
  row: IOwedRow;
}

function Body({ row, submitting, error, on_submit, on_close }: IBody) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<IWriteOff>({
    resolver: valibotResolver(schema),
    defaultValues: { reason: "" },
  });
  const submit_once = use_submit_once(submitting, error);

  return (
    <form
      onSubmit={handleSubmit((values) => submit_once(() => on_submit(values)))}
    >
      <div className="p-6 sm:p-8 grid gap-4">
        <div>
          <h3 className="text-lg font-bold mb-1">{HEADING}</h3>
          <p className="text-sm text-gray-11">
            Sets what this row owes to $0 and books it as a loss.
          </p>
        </div>
        <RowSummary row={row} amount_label="To write off" />
        <Field
          {...register("reason")}
          type="textarea"
          label="Reason"
          required
          rows={3}
          classes={{ input: "w-full" }}
          error={errors.reason?.message}
        />
      </div>
      <DialogActions
        submitting={submitting}
        error={error}
        label="Write off"
        busy_label="Writing off…"
        tone="btn-destructive"
        on_close={on_close}
      />
    </form>
  );
}

interface IRemainder {
  usd: number;
  on_close: () => void;
}

function Remainder({ usd, on_close }: IRemainder) {
  const note = useRef<HTMLParagraphElement>(null);
  // the panel replaces the submit, which takes focus with it
  useEffect(() => note.current?.focus(), []);

  return (
    <div>
      <div className="p-6 sm:p-8 grid gap-4">
        <h3 className="text-lg font-bold">{HEADING}</h3>
        <p
          ref={note}
          tabIndex={-1}
          className="p-3 rounded border border-warning bg-warning-subtle text-sm text-warning-subtle-fg"
        >
          The write-off went through, but this row still owes ${humanize(usd)}.
        </p>
      </div>
      <Actions band>
        <button type="button" onClick={on_close} className="btn btn-primary">
          Close
        </button>
      </Actions>
    </div>
  );
}
