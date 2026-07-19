import { LoaderCircle } from "lucide-react";

interface Props {
  col_span: number;
  disabled?: boolean;
  loading?: boolean;
  on_load_next(): void;
}

export function LoadMoreRow(props: Props) {
  return (
    <tfoot>
      <LoadMoreTr {...props} />
    </tfoot>
  );
}

/** bare <tr> variant; use when the table already owns its <tfoot> */
export function LoadMoreTr({
  col_span,
  disabled,
  loading,
  on_load_next,
}: Props) {
  return (
    <tr>
      {/* override .table td padding — otherwise button hover bg doesn't fill the cell */}
      <td colSpan={col_span} className="p-0">
        <button
          disabled={disabled || loading}
          onClick={on_load_next}
          type="button"
        >
          <LoaderCircle
            className={`size-5 ${loading ? "animate-spin" : "invisible"}`}
          />
          {loading ? "Loading..." : "View More"}
        </button>
      </td>
    </tr>
  );
}
