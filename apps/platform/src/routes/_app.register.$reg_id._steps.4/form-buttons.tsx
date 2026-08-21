import { LoadText } from "@better-giving/ui";
import { Link } from "react-router";
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
  isSubmitting = false,
  back,
}: {
  isSubmitting?: boolean;
  back: string;
}) {
  return (
    <div className="grid gap-4 mt-8">
      <div className="grid grid-cols-2 sm:flex gap-2">
        <Link
          aria-disabled={isSubmitting}
          to={`../${back}`}
          className="min-w-32 btn btn-secondary"
        >
          Back
        </Link>
        <button
          aria-disabled={isSubmitting}
          disabled={isSubmitting}
          type="submit"
          className="min-w-32 btn btn-primary"
        >
          <LoadText is_loading={isSubmitting}>Submit</LoadText>
        </button>
      </div>
    </div>
  );
}
