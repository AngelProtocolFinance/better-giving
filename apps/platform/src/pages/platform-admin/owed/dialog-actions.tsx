import { Actions } from "@better-giving/ui";

interface IDialogActions {
  submitting: boolean;
  /** the refusal the last request came back with */
  error?: string;
  label: string;
  busy_label: string;
  /** the submit's variant class */
  tone: "btn-primary" | "btn-destructive";
  on_close: () => void;
}

/**
 * Cancel and the submit, both held (not `disabled`) while a request is in
 * flight: `disabled` would drop focus off the pressed button onto `<body>`.
 * the refusal is drawn at the submit, the control that was pressed.
 */
export function DialogActions({
  submitting,
  error,
  label,
  busy_label,
  tone,
  on_close,
}: IDialogActions) {
  return (
    <>
      <div role="alert" id="owed-dialog-error" className="px-6 sm:px-8">
        {error && (
          <p className="mb-4 text-sm text-destructive-subtle-fg">{error}</p>
        )}
      </div>
      <Actions band>
        <button
          type="button"
          aria-disabled={submitting}
          onClick={() => {
            if (!submitting) on_close();
          }}
          className="btn btn-secondary"
        >
          Cancel
        </button>
        <button
          type="submit"
          aria-disabled={submitting}
          aria-busy={submitting}
          aria-describedby="owed-dialog-error"
          onClick={(e) => {
            if (submitting) e.preventDefault();
          }}
          className={`btn ${tone} ${submitting ? "pending" : ""}`}
        >
          {submitting ? busy_label : label}
        </button>
      </Actions>
    </>
  );
}
