import { Form, useFetcher } from "react-router";
import { useRemixForm } from "remix-hook-form";
import { Field } from "#/components/form";
import { company_name_max_length, type IEmployerFv } from "./schema";

interface IEmployerForm {
  /** employer already recorded against this donation, if any */
  init?: string;
}

/**
 * employer capture — a labelled text input and a button, nothing else.
 *
 * checkout collects a usable employer on a fraction of a percent of donations,
 * so nearly every donor arrives here with nothing on record. this screen is
 * post-donation, which is what makes asking safe: there is no conversion left
 * to lose, so the field can say plainly why it wants the answer.
 *
 * there is deliberately no typeahead. the suggestions an earlier design offered
 * drew from rows a human had verified, and no such table exists any more —
 * nothing anywhere knows whether a given employer runs a matching programme, so
 * a list would be an assertion we cannot make. worse, a donor who scans one and
 * does not find their employer reads that as "they don't match".
 */
export function EmployerForm({ init }: IEmployerForm) {
  const fetcher = useFetcher({ key: "donation" });
  const {
    handleSubmit,
    register,
    formState: { errors },
  } = useRemixForm<IEmployerFv>({
    fetcher,
    defaultValues: { type: "employer", company_name: "" },
  });

  // already on record: the action ignores a second submit, so show what we hold
  // rather than an input whose submission would silently do nothing
  if (init) {
    return (
      <p className="text-sm">
        <span className="text-muted-fg">You work at </span>
        <span className="font-semibold">{init}</span>
      </p>
    );
  }

  return (
    <Form onSubmit={handleSubmit} method="POST" className="grid">
      <Field
        {...register("company_name")}
        label="Where do you work?"
        // conditional on purpose: we hold nothing about any employer, so the
        // copy promises our own paperwork, never their programme
        sub="If your employer runs a matching gift program, we'll email you what to file."
        placeholder="e.g. Apple"
        maxLength={company_name_max_length}
        required
        error={errors.company_name?.message}
        classes={{ container: "[&_input]:bg-input" }}
      />
      <button
        disabled={fetcher.state !== "idle"}
        type="submit"
        className="btn btn-primary text-sm px-4 py-2 rounded mt-4 justify-self-end"
      >
        Save
      </button>
    </Form>
  );
}
