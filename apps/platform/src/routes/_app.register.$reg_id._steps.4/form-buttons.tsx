import { Button } from "@better-giving/ui";
import type {
  FormButtonsProps,
  IFormButtons,
} from "#/components/bank-details/types";

/** the step behind banking depends on `o_type` (a 501(c)(3) has no agreement
 * step), and `BankDetails` takes the buttons as a component — so the target is
 * bound here rather than read from a route the buttons don't own. */
export const form_buttons =
  (back: string): IFormButtons =>
  (props: FormButtonsProps) => <Submit {...props} back={back} />;

function Submit({
  is_submitting = false,
  back,
}: {
  is_submitting?: boolean;
  back: string;
}) {
  return (
    <div className="grid gap-4 mt-8">
      <div className="grid grid-cols-2 sm:flex gap-2">
        <Button
          variant="secondary"
          to={`../${back}`}
          disabled={is_submitting}
          className="min-w-32"
        >
          Back
        </Button>
        <Button
          variant="primary"
          type="submit"
          is_loading={is_submitting}
          className="min-w-32"
        >
          Submit
        </Button>
      </div>
    </div>
  );
}
