import { Button } from "@better-giving/ui";
import type { FormButtonsProps } from "#/components/bank-details/types";

export function FormButtons({
  disabled = false,
  is_submitting = false,
}: FormButtonsProps) {
  return (
    <div className="grid gap-4">
      <Button
        variant="primary"
        type="submit"
        disabled={disabled}
        is_loading={is_submitting}
        className="gap-1 w-full md:w-80"
      >
        Submit
      </Button>
    </div>
  );
}
