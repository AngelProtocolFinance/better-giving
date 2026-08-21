import { LoadText } from "@better-giving/ui";
import type { FormButtonsProps } from "#/components/bank-details/types";

export function FormButtons({
  disabled = false,
  isSubmitting = false,
}: FormButtonsProps) {
  return (
    <div className="grid gap-4">
      <button
        disabled={disabled || isSubmitting}
        type="submit"
        className="btn btn-primary gap-1 w-full md:w-80"
      >
        <LoadText is_loading={isSubmitting}>Submit</LoadText>
      </button>
    </div>
  );
}
