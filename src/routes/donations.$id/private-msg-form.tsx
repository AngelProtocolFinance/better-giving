import { Form, useFetcher } from "react-router";
import { useRemixForm } from "remix-hook-form";
import { donor_msg_to_npo_max_length } from "@/donations/schema";
import type { IPrivateMsgFv } from "./schema";

interface Props {
  init?: string;
  classes?: string;
}
export function PrivateMsgForm({ classes = "", init }: Props) {
  const fetcher = useFetcher({ key: "donation" });
  const {
    handleSubmit,
    register,
    watch,
    formState: { errors },
  } = useRemixForm<IPrivateMsgFv>({
    fetcher,
    defaultValues: { msg: init, type: "private_msg" },
  });

  const msg = watch("msg");

  return (
    <Form onSubmit={handleSubmit} method="POST" className={`${classes}`}>
      <div className="col-span-full">
        <label htmlFor="private-msg-textarea" className="sr-only">
          Private message
        </label>
        <p
          id="private-msg-char-count"
          data-exceed={errors.msg?.type === "max"}
          className="text-xs text-muted-fg -mt-2 data-[exceed='true']:text-destructive text-right mb-1"
          aria-live="polite"
          aria-atomic="true"
        >
          {msg?.length ?? 0}/{donor_msg_to_npo_max_length}
        </p>
        <textarea
          {...register("msg")}
          disabled={!!init}
          id="private-msg-textarea"
          aria-invalid={!!errors.msg?.message}
          aria-describedby={`private-msg-char-count${errors.msg?.message ? " private-msg-error" : ""}`}
          maxLength={donor_msg_to_npo_max_length}
          rows={4}
          className="field-input w-full"
        />
        <p
          id="private-msg-error"
          className="text-destructive text-xs empty:hidden text-right"
          role="alert"
        >
          {errors.msg?.message}
        </p>
      </div>
      <button
        disabled={fetcher.state !== "idle" || !!init}
        type="submit"
        className="btn btn-primary text-sm px-4 py-2 rounded mt-4 justify-self-end"
      >
        Submit
      </button>
    </Form>
  );
}
